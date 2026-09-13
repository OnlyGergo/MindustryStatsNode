package geoip

import (
	"net/netip"
	"path/filepath"
	"testing"
)

func TestMissingDatabaseIsNotFatal(t *testing.T) {
	// The country code is decoration on a server row: a missing mmdb must leave
	// the collector polling, just without country codes.
	l := New(filepath.Join(t.TempDir(), "missing.mmdb"))
	defer l.Close()

	if got := l.Country(netip.MustParseAddr("8.8.8.8")); got != "" {
		t.Errorf("Country() = %q, want an empty code with no database", got)
	}
	if got := l.CountryString("8.8.8.8"); got != "" {
		t.Errorf("CountryString() = %q, want an empty code with no database", got)
	}
	if err := l.Reload(); err == nil {
		t.Error("Reload() of a missing file should report the failure")
	}
}

func TestInvalidAddressesReturnNoCode(t *testing.T) {
	l := New(filepath.Join(t.TempDir(), "missing.mmdb"))
	defer l.Close()

	if got := l.CountryString("not-an-ip"); got != "" {
		t.Errorf("CountryString(%q) = %q, want %q", "not-an-ip", got, "")
	}
	if got := l.Country(netip.Addr{}); got != "" {
		t.Errorf("Country(zero addr) = %q, want %q", got, "")
	}
}

func TestCloseIsIdempotent(t *testing.T) {
	l := New(filepath.Join(t.TempDir(), "missing.mmdb"))
	if err := l.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}
	if err := l.Close(); err != nil {
		t.Fatalf("second Close() error = %v", err)
	}
}
