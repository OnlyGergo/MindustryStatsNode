package poller

import (
	"context"
	"net"
	"net/netip"
	"strings"
	"sync"
	"time"
)

// DefaultPort is Mindustry's default server port.  The client only consults SRV
// records for an address given without a port, i.e. on this one.
const DefaultPort = 6567

// srvTTL is how long an SRV answer (or the lack of one) is reused.  Most hosts
// have no record at all, and without this every offline hostname would cost an
// extra DNS query each cycle.
const srvTTL = 15 * time.Minute

// maxSRVTargets bounds how many records one poll walks; each costs a full
// timeout when it does not answer.
const maxSRVTargets = 3

type srvTarget struct {
	host string
	port int
}

type srvEntry struct {
	targets []srvTarget
	expires time.Time
}

type srvCache struct {
	mu      sync.Mutex
	entries map[string]srvEntry
	// viaSRV marks hosts whose last answer came through their SRV record.
	viaSRV map[string]bool
	now    func() time.Time
	lookup func(ctx context.Context, service, proto, name string) (string, []*net.SRV, error)
}

func newSRVCache() srvCache {
	return srvCache{
		entries: make(map[string]srvEntry),
		viaSRV:  make(map[string]bool),
		now:     time.Now,
		lookup:  net.DefaultResolver.LookupSRV,
	}
}

// srvEligible mirrors the client: SRV only applies to a hostname on the
// default port.
func (p *Poller) srvEligible(host string, port int) bool {
	if port != DefaultPort || host == "" {
		return false
	}
	_, err := netip.ParseAddr(host)
	return err != nil
}

// lookupSRV returns _mindustry._tcp.<host>'s targets, priority-sorted and
// weight-shuffled by the resolver, cached for srvTTL.  Lookup failures are
// cached as "no record" too: a missing record is the normal case.
func (p *Poller) lookupSRV(ctx context.Context, host string) []srvTarget {
	key := strings.ToLower(host)
	c := &p.srv

	c.mu.Lock()
	entry, ok := c.entries[key]
	c.mu.Unlock()
	if ok && c.now().Before(entry.expires) {
		return entry.targets
	}

	_, records, err := c.lookup(ctx, "mindustry", "tcp", host)
	if err != nil && ctx.Err() != nil {
		return nil
	}

	var targets []srvTarget
	for _, record := range records {
		target := strings.TrimSuffix(record.Target, ".")
		// "." is the RFC 2782 "service not available here" marker.
		if target == "" || record.Port == 0 {
			continue
		}
		targets = append(targets, srvTarget{host: target, port: int(record.Port)})
		if len(targets) == maxSRVTargets {
			break
		}
	}

	c.mu.Lock()
	c.entries[key] = srvEntry{targets: targets, expires: c.now().Add(srvTTL)}
	if len(targets) == 0 {
		delete(c.viaSRV, key)
	}
	c.mu.Unlock()
	return targets
}

func (p *Poller) prefersSRV(host string) bool {
	p.srv.mu.Lock()
	defer p.srv.mu.Unlock()
	return p.srv.viaSRV[strings.ToLower(host)]
}

func (p *Poller) setPrefersSRV(host string, via bool) {
	key := strings.ToLower(host)
	p.srv.mu.Lock()
	defer p.srv.mu.Unlock()
	if via {
		p.srv.viaSRV[key] = true
	} else {
		delete(p.srv.viaSRV, key)
	}
}
