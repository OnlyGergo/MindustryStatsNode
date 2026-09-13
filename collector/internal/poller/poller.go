// Package poller queries a Mindustry server over UDP.
//
// Port of backend/src/services/mindustryService.ts.  The read order and the byte
// offsets below have to stay identical to that file's: they are the wire format,
// not a choice.
package poller

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/geoip"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/logging"
)

// queryPacket is Mindustry's server-info request.
var queryPacket = []byte{0xFE, 0x01}

// ServerData is common/models/serverData.ts's ServerData.  Empty strings stand
// in for the TS nulls; the repository maps them back to NULL or ” per column,
// which is what the TS `?? ”` / `?? null` coalescing did.
type ServerData struct {
	Ping        int
	Host        string
	Port        int
	ServerName  string
	MapName     string
	Players     int32
	Wave        int32
	Version     int32
	VersionType string
	Mode        GameMode
	PlayerLimit int32
	Description string
	ModeName    string
	Online      bool
	CountryCode string
}

// Poller holds the query timeout and the geoip database; it is safe for
// concurrent use by the collector's workers.
type Poller struct {
	timeout  time.Duration
	geo      *geoip.Lookup
	log      *slog.Logger
	resolver *net.Resolver

	// failedServers keeps a socket error from being logged on every cycle for a
	// server that is simply gone, as failedServersCache did.
	mu            sync.Mutex
	failedServers map[string]struct{}
}

func New(timeout time.Duration, geo *geoip.Lookup) *Poller {
	return &Poller{
		timeout:       timeout,
		geo:           geo,
		log:           logging.New("Mindustry Service"),
		resolver:      net.DefaultResolver,
		failedServers: make(map[string]struct{}),
	}
}

// Query pings a server for status, map and player metrics.
//
// A nil result with a nil error is the TS `null`: the server did not answer, or
// answered with something undecodable.  That is an ordinary outcome -- most
// servers in the list are dead -- so it is not an error.  A non-nil error is
// reserved for the cases mindustryService.ts logged at error level.
func (p *Poller) Query(ctx context.Context, host string, port int, serverKey string) (*ServerData, error) {
	if port < 0 || port > 65535 {
		return nil, &InvalidPortError{Host: host, Port: port}
	}

	addr, err := p.resolveHost(ctx, host)
	if err != nil {
		return nil, err
	}
	if !addr.IsValid() {
		return nil, nil
	}

	start := time.Now()

	conn, err := net.DialUDP("udp4", nil, net.UDPAddrFromAddrPort(netip.AddrPortFrom(addr, uint16(port))))
	if err != nil {
		p.noteSocketError(serverKey, err)
		return nil, nil
	}
	defer conn.Close()

	deadline := start.Add(p.timeout)
	if ctxDeadline, ok := ctx.Deadline(); ok && ctxDeadline.Before(deadline) {
		deadline = ctxDeadline
	}
	if err := conn.SetDeadline(deadline); err != nil {
		p.noteSocketError(serverKey, err)
		return nil, nil
	}

	// A cancelled context has to interrupt the blocking read, or shutdown waits
	// out the full timeout on every in-flight query.
	stop := context.AfterFunc(ctx, func() { _ = conn.SetDeadline(time.Now()) })
	defer stop()

	if _, err := conn.Write(queryPacket); err != nil {
		p.noteSocketError(serverKey, err)
		return nil, nil
	}

	// Mindustry's info response fits comfortably; anything larger is not one.
	buf := make([]byte, 2048)
	n, err := conn.Read(buf)
	if err != nil {
		// A timeout is the common case: the server is offline or firewalled.
		if !errors.Is(err, context.Canceled) && !isTimeout(err) {
			p.noteSocketError(serverKey, err)
		}
		return nil, nil
	}

	data, err := p.decode(buf[:n], host, port, int(time.Since(start).Milliseconds()), addr)
	if err != nil {
		p.log.Error("Failed to parse packet", "server", serverKey, "err", err)
		return nil, nil
	}

	p.clearFailure(serverKey)
	return data, nil
}

// decode walks the response in the exact order mindustryService.ts read it.
func (p *Poller) decode(buf []byte, host string, port, ping int, addr netip.Addr) (*ServerData, error) {
	offset := 0

	serverName, err := ReadString(buf, &offset)
	if err != nil {
		p.log.Error("Failed to read server name", "host", host, "err", err)
		return nil, err
	}
	mapName, err := ReadString(buf, &offset)
	if err != nil {
		p.log.Error("Failed to read map name", "host", host, "err", err)
		return nil, err
	}
	players, err := ReadInt32BE(buf, &offset)
	if err != nil {
		p.log.Error("Failed to read players", "host", host, "err", err)
		return nil, err
	}
	wave, err := ReadInt32BE(buf, &offset)
	if err != nil {
		p.log.Error("Failed to read wave", "host", host, "err", err)
		return nil, err
	}
	version, err := ReadInt32BE(buf, &offset)
	if err != nil {
		p.log.Error("Failed to read version", "host", host, "err", err)
		return nil, err
	}
	versionType, err := ReadString(buf, &offset)
	if err != nil {
		p.log.Error("Failed to read version type", "host", host, "err", err)
		return nil, err
	}

	modeByte, err := ReadUint8(buf, &offset)
	if err != nil {
		p.log.Error("Failed to read mode byte", "host", host, "err", err)
		return nil, err
	}
	// An ordinal this build does not know about is recorded as Survival, which
	// is the enum's zero value and what the TS bounds check fell back to.
	mode := GameModeSurvival
	if int(modeByte) < gameModeCount {
		mode = GameMode(modeByte)
	}

	playerLimit, err := ReadInt32BE(buf, &offset)
	if err != nil {
		p.log.Error("Failed to read player limit", "host", host, "err", err)
		return nil, err
	}
	description, err := ReadString(buf, &offset)
	if err != nil {
		p.log.Error("Failed to read description", "host", host, "err", err)
		return nil, err
	}
	rawModeName, err := ReadString(buf, &offset)
	if err != nil {
		p.log.Error("Failed to read mode name", "host", host, "err", err)
		return nil, err
	}

	return &ServerData{
		Ping:        ping,
		Host:        host,
		Port:        port,
		ServerName:  serverName,
		MapName:     mapName,
		Players:     players,
		Wave:        wave,
		Version:     version,
		VersionType: versionType,
		Mode:        mode,
		PlayerLimit: playerLimit,
		Description: description,
		ModeName:    DecodeGamemode(rawModeName, int(mode)),
		Online:      true,
		CountryCode: p.geo.Country(addr),
	}, nil
}

// resolveHost resolves a hostname to an IPv4 address.
//
// An invalid address comes back as the zero Addr with a nil error: that is the
// TS `return null` for the DNS failures ("ESERVFAIL", "ENOTFOUND") that simply
// mean the server is gone.
func (p *Poller) resolveHost(ctx context.Context, host string) (netip.Addr, error) {
	// Already an IPv4 literal.
	if addr, err := netip.ParseAddr(host); err == nil {
		if addr.Is4() {
			return addr, nil
		}
		return netip.Addr{}, nil
	}

	addrs, err := p.resolver.LookupNetIP(ctx, "ip4", host)
	if err != nil {
		var dnsErr *net.DNSError
		// Annoying but exists.  This needs to be here.
		if errors.As(err, &dnsErr) && (dnsErr.IsNotFound || dnsErr.IsTemporary || dnsErr.IsTimeout) {
			p.log.Debug("DNS lookup failed", "host", host, "err", dnsErr.Err)
			return netip.Addr{}, nil
		}
		if errors.Is(err, context.Canceled) {
			return netip.Addr{}, nil
		}
		return netip.Addr{}, &DNSError{Host: host, Err: err}
	}

	for _, addr := range addrs {
		if addr.Is4() {
			return addr, nil
		}
		if addr.Is4In6() {
			return addr.Unmap(), nil
		}
	}
	return netip.Addr{}, nil
}

// offlineErrors covers errors from failed DNS lookups and anything related to a
// wrong packet or a closed firewall.  Matching on the message keeps the check
// working for the wrapped errors the net package returns.
var offlineErrors = []string{
	"no route to host",       // EHOSTUNREACH
	"connection refused",     // ECONNREFUSED
	"protocol error",         // EPROTO
	"i/o timeout",            // ETIMEDOUT
	"network is unreachable", // ENETUNREACH
}

func isOfflineErrorMessage(msg string) bool {
	for _, candidate := range offlineErrors {
		if strings.Contains(msg, candidate) {
			return true
		}
	}
	return false
}

func isTimeout(err error) bool {
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

// noteSocketError logs a socket failure once per server until that server
// answers again, so a permanently dead host does not fill the log every cycle.
func (p *Poller) noteSocketError(serverKey string, err error) {
	if isOfflineErrorMessage(err.Error()) {
		return
	}

	p.mu.Lock()
	_, seen := p.failedServers[serverKey]
	if !seen {
		p.failedServers[serverKey] = struct{}{}
	}
	p.mu.Unlock()

	if !seen {
		p.log.Warn("Socket error", "server", serverKey, "err", err)
	}
}

func (p *Poller) clearFailure(serverKey string) {
	p.mu.Lock()
	delete(p.failedServers, serverKey)
	p.mu.Unlock()
}

// InvalidPortError is the `Invalid port provided` branch.
type InvalidPortError struct {
	Host string
	Port int
}

func (e *InvalidPortError) Error() string {
	return "invalid port " + strconv.Itoa(e.Port) + " for " + e.Host
}

// DNSError is the resolver failure mindustryService.ts logged at error level.
type DNSError struct {
	Host string
	Err  error
}

func (e *DNSError) Error() string { return "DNS lookup failed for " + e.Host + ": " + e.Err.Error() }
func (e *DNSError) Unwrap() error { return e.Err }
