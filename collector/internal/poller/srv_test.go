package poller

import (
	"context"
	"net"
	"sync/atomic"
	"testing"
	"time"
)

// fakeServer answers every info request on 127.0.0.1 with a fixed packet.
func fakeServer(t *testing.T) int {
	t.Helper()
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1)})
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { conn.Close() })

	packet := buildPacket("SRV Server", "Map", 3, 1, 146, "official", 0, 20, "", "")
	go func() {
		buf := make([]byte, 16)
		for {
			_, from, err := conn.ReadFromUDP(buf)
			if err != nil {
				return
			}
			_, _ = conn.WriteToUDP(packet, from)
		}
	}()
	return conn.LocalAddr().(*net.UDPAddr).Port
}

func TestQueryFallsBackToSRV(t *testing.T) {
	p := testPoller(t)
	port := fakeServer(t)

	var lookups atomic.Int32
	p.srv.lookup = func(_ context.Context, service, proto, name string) (string, []*net.SRV, error) {
		lookups.Add(1)
		if service != "mindustry" || proto != "tcp" || name != "localhost" {
			t.Errorf("lookup(%q, %q, %q)", service, proto, name)
		}
		return "", []*net.SRV{{Target: "127.0.0.1.", Port: uint16(port)}}, nil
	}

	// localhost:6567 has nobody listening, so the direct attempt times out and
	// the SRV record is tried.
	data, err := p.Query(context.Background(), "localhost", DefaultPort, "k")
	if err != nil || data == nil {
		t.Fatalf("Query() = %v, %v; want an answer through SRV", data, err)
	}
	if data.Host != "localhost" || data.Port != DefaultPort {
		t.Errorf("recorded as %s:%d; want the listed address", data.Host, data.Port)
	}
	if data.ResolvedPort != port || data.ResolvedIP.String() != "127.0.0.1" {
		t.Errorf("resolved %s:%d; want 127.0.0.1:%d", data.ResolvedIP, data.ResolvedPort, port)
	}

	// The next poll goes straight to SRV (no direct timeout) and reuses the
	// cached record.
	start := time.Now()
	if data, _ := p.Query(context.Background(), "localhost", DefaultPort, "k"); data == nil {
		t.Fatal("second Query() did not answer")
	}
	if took := time.Since(start); took >= p.timeout {
		t.Errorf("second Query() took %v; want SRV first", took)
	}
	if n := lookups.Load(); n != 1 {
		t.Errorf("SRV looked up %d times; want 1 (cached)", n)
	}
}

func TestSRVOnlyForHostnamesOnDefaultPort(t *testing.T) {
	p := testPoller(t)
	cases := []struct {
		host string
		port int
		want bool
	}{
		{"play.example.com", DefaultPort, true},
		{"play.example.com", 6000, false},
		{"1.2.3.4", DefaultPort, false},
		{"", DefaultPort, false},
	}
	for _, c := range cases {
		if got := p.srvEligible(c.host, c.port); got != c.want {
			t.Errorf("srvEligible(%q, %d) = %v, want %v", c.host, c.port, got, c.want)
		}
	}
}

func TestLookupSRVSkipsUnavailableMarker(t *testing.T) {
	p := testPoller(t)
	p.srv.lookup = func(context.Context, string, string, string) (string, []*net.SRV, error) {
		return "", []*net.SRV{{Target: ".", Port: 0}, {Target: "a.example.", Port: 6000}}, nil
	}
	got := p.lookupSRV(context.Background(), "x.example")
	if len(got) != 1 || got[0].host != "a.example" || got[0].port != 6000 {
		t.Errorf("lookupSRV = %+v", got)
	}
}
