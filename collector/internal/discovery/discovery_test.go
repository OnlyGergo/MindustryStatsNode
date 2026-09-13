package discovery

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/config"
)

func TestSplitAddress(t *testing.T) {
	tests := []struct {
		name     string
		address  string
		wantHost string
		wantPort int
	}{
		{"host and port", "mindustry.example.com:6567", "mindustry.example.com", 6567},
		{"non-default port", "1.2.3.4:7000", "1.2.3.4", 7000},
		{"bare host gets the default port", "1.2.3.4", "1.2.3.4", defaultPort},
		{"surrounding whitespace is trimmed", "  1.2.3.4  ", "1.2.3.4", defaultPort},
		{"whitespace around a host with a port", " host :6567", "host", 6567},
		{"unparseable port falls back to the default", "host:abc", "host", defaultPort},
		{"parseInt semantics: digits then junk", "host:6567abc", "host", 6567},
		{"empty port falls back to the default", "host:", "host", defaultPort},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			host, port := splitAddress(tc.address)
			if host != tc.wantHost || port != tc.wantPort {
				t.Errorf("splitAddress(%q) = (%q, %d), want (%q, %d)", tc.address, host, port, tc.wantHost, tc.wantPort)
			}
		})
	}
}

func TestFetchParsesAServerList(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `[
			{"name": "Network A", "address": ["a.example.com:6567", "1.2.3.4"]},
			{"name": "Network B", "address": ["b.example.com:7000"]}
		]`)
	}))
	defer srv.Close()

	d := New(config.DiscoveryConfig{FetchTimeout: 5 * time.Second}, nil, nil)

	groups, err := d.fetch(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("fetch() error = %v", err)
	}
	if len(groups) != 2 {
		t.Fatalf("fetch() returned %d groups, want 2", len(groups))
	}
	if groups[0].Name != "Network A" || len(groups[0].Address) != 2 {
		t.Errorf("group 0 = %+v", groups[0])
	}
}

func TestFetchRejectsAnErrorStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	d := New(config.DiscoveryConfig{FetchTimeout: 5 * time.Second}, nil, nil)

	if _, err := d.fetch(context.Background(), srv.URL); err == nil {
		t.Fatal("fetch() of a 500: want an error, got nil")
	}
}

func TestFetchRejectsMalformedJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"not": "a list"}`)
	}))
	defer srv.Close()

	d := New(config.DiscoveryConfig{FetchTimeout: 5 * time.Second}, nil, nil)

	if _, err := d.fetch(context.Background(), srv.URL); err == nil {
		t.Fatal("fetch() of a non-list body: want an error, got nil")
	}
}

func TestFetchSanitizesGroupNames(t *testing.T) {
	// A serverlist is a third party's file, and its names land in server_groups;
	// a text column cannot hold the NUL this one carries.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `[{"name": "A\u0000B", "address": ["h"]}]`)
	}))
	defer srv.Close()

	d := New(config.DiscoveryConfig{FetchTimeout: 5 * time.Second}, nil, nil)

	groups, err := d.fetch(context.Background(), srv.URL)
	if err != nil {
		t.Fatalf("fetch() error = %v", err)
	}
	if groups[0].Name != "AB" {
		t.Errorf("group name = %q, want the NUL removed", groups[0].Name)
	}
}
