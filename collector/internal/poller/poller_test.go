package poller

import (
	"context"
	"encoding/binary"
	"net"
	"net/netip"
	"testing"
	"time"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/geoip"
)

// buildPacket assembles a response in the exact field order
// mindustryService.ts read it in.
func buildPacket(serverName, mapName string, players, wave, version int32, versionType string, mode byte, playerLimit int32, description, modeName string) []byte {
	var buf []byte
	appendInt := func(v int32) {
		var b [4]byte
		binary.BigEndian.PutUint32(b[:], uint32(v))
		buf = append(buf, b[:]...)
	}

	buf = append(buf, packString(serverName)...)
	buf = append(buf, packString(mapName)...)
	appendInt(players)
	appendInt(wave)
	appendInt(version)
	buf = append(buf, packString(versionType)...)
	buf = append(buf, mode)
	appendInt(playerLimit)
	buf = append(buf, packString(description)...)
	buf = append(buf, packString(modeName)...)
	return buf
}

func testPoller(t *testing.T) *Poller {
	t.Helper()
	// No mmdb on a test machine: lookups return "" rather than failing.
	return New(500*time.Millisecond, geoip.New(t.TempDir()+"/missing.mmdb"))
}

func TestDecode(t *testing.T) {
	p := testPoller(t)
	packet := buildPacket("[accent]Test Server", "Ancient Caldera", 12, 43, 146, "official", 2, 64, "A description", "")

	data, err := p.decode(packet, "example.org", 6567, 7, netipMustParse(t, "1.2.3.4"))
	if err != nil {
		t.Fatalf("decode() error = %v", err)
	}

	if data.ServerName != "[accent]Test Server" {
		t.Errorf("ServerName = %q; colour markup is stored as sent", data.ServerName)
	}
	if data.MapName != "Ancient Caldera" {
		t.Errorf("MapName = %q, want %q", data.MapName, "Ancient Caldera")
	}
	if data.Players != 12 || data.Wave != 43 || data.Version != 146 || data.PlayerLimit != 64 {
		t.Errorf("numbers = players %d wave %d version %d limit %d", data.Players, data.Wave, data.Version, data.PlayerLimit)
	}
	if data.VersionType != "official" {
		t.Errorf("VersionType = %q, want %q", data.VersionType, "official")
	}
	if data.Mode != GameModeAttack {
		t.Errorf("Mode = %d, want %d", data.Mode, GameModeAttack)
	}
	if data.Description != "A description" {
		t.Errorf("Description = %q", data.Description)
	}
	// An empty mode name falls back to the vanilla name for the ordinal.
	if data.ModeName != "Attack" {
		t.Errorf("ModeName = %q, want %q", data.ModeName, "Attack")
	}
	if !data.Online || data.Ping != 7 || data.Host != "example.org" || data.Port != 6567 {
		t.Errorf("envelope = %+v", data)
	}
}

func TestDecodeUnknownModeFallsBackToSurvival(t *testing.T) {
	p := testPoller(t)
	// 0x2A is past the enum, which the TS bounds check mapped to SURVIVAL.
	packet := buildPacket("s", "m", 0, 0, 146, "official", 0x2A, 10, "", "Hexed")

	data, err := p.decode(packet, "h", 1, 0, netipMustParse(t, "1.2.3.4"))
	if err != nil {
		t.Fatalf("decode() error = %v", err)
	}
	if data.Mode != GameModeSurvival {
		t.Errorf("Mode = %d, want SURVIVAL for an out-of-range ordinal", data.Mode)
	}
	if data.ModeName != "Hexed" {
		t.Errorf("ModeName = %q, want the server's own name", data.ModeName)
	}
}

func TestDecodeTruncatedPacket(t *testing.T) {
	p := testPoller(t)
	full := buildPacket("s", "m", 1, 2, 146, "official", 0, 10, "d", "n")

	if _, err := p.decode(full[:len(full)-3], "h", 1, 0, netipMustParse(t, "1.2.3.4")); err == nil {
		t.Fatal("decode() of a truncated packet: want an error, got nil")
	}
}

func TestQueryRoundTrip(t *testing.T) {
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1)})
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer conn.Close()

	reply := buildPacket("Local", "Ground Zero", 3, 1, 146, "official", 1, 20, "desc", "Sandbox")

	go func() {
		buf := make([]byte, 64)
		n, addr, err := conn.ReadFromUDP(buf)
		if err != nil {
			return
		}
		if n != 2 || buf[0] != 0xFE || buf[1] != 0x01 {
			t.Errorf("request = % x, want fe 01", buf[:n])
			return
		}
		_, _ = conn.WriteToUDP(reply, addr)
	}()

	p := testPoller(t)
	port := conn.LocalAddr().(*net.UDPAddr).Port

	data, err := p.Query(context.Background(), "127.0.0.1", port, "server:data:1")
	if err != nil {
		t.Fatalf("Query() error = %v", err)
	}
	if data == nil {
		t.Fatal("Query() = nil, want a decoded response")
	}
	if data.ServerName != "Local" || data.Players != 3 || data.ModeName != "Sandbox" {
		t.Errorf("Query() = %+v", data)
	}
	if data.Ping < 0 {
		t.Errorf("Ping = %d, want a non-negative duration", data.Ping)
	}
}

func TestQueryTimeoutIsNotAnError(t *testing.T) {
	// Nothing is listening: an unanswered query is an ordinary offline server.
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1)})
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	port := conn.LocalAddr().(*net.UDPAddr).Port
	conn.Close()

	p := New(100*time.Millisecond, geoip.New(t.TempDir()+"/missing.mmdb"))

	data, err := p.Query(context.Background(), "127.0.0.1", port, "server:data:2")
	if err != nil {
		t.Fatalf("Query() error = %v, want nil for an unanswered server", err)
	}
	if data != nil {
		t.Fatalf("Query() = %+v, want nil", data)
	}
}

func TestQueryRejectsInvalidPort(t *testing.T) {
	p := testPoller(t)

	if _, err := p.Query(context.Background(), "127.0.0.1", 70000, "server:data:3"); err == nil {
		t.Fatal("Query() with an out-of-range port: want an error, got nil")
	}
}

func netipMustParse(t *testing.T, s string) netip.Addr {
	t.Helper()
	addr, err := netip.ParseAddr(s)
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return addr
}
