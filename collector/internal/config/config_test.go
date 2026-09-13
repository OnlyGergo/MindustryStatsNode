package config

import (
	"testing"
	"time"
)

func TestParseIntPrefix(t *testing.T) {
	tests := []struct {
		in     string
		want   int
		wantOK bool
	}{
		{"6567", 6567, true},
		{" 6567 ", 6567, true},
		{"6567abc", 6567, true},
		{"-5", -5, true},
		{"+5", 5, true},
		{"abc", 0, false},
		{"", 0, false},
		{"-", 0, false},
	}

	for _, tc := range tests {
		got, ok := ParseIntPrefix(tc.in)
		if ok != tc.wantOK || got != tc.want {
			t.Errorf("ParseIntPrefix(%q) = (%d, %v), want (%d, %v)", tc.in, got, ok, tc.want, tc.wantOK)
		}
	}
}

func TestLoadDefaults(t *testing.T) {
	// index.ts's defaults, which a deployment without a full .env relies on.
	t.Setenv("DB_PASSWORD", "secret")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Discovery.ServerListInterval != 24*time.Hour {
		t.Errorf("SERVER_LIST_INTERVAL_MS default = %v, want 24h", cfg.Discovery.ServerListInterval)
	}
	if cfg.Collector.DataCollectionInterval != 5*time.Minute {
		t.Errorf("DATA_COLLECTION_INTERVAL_MS default = %v, want 5m", cfg.Collector.DataCollectionInterval)
	}
	if cfg.Collector.ServerCollectionInterval != time.Second {
		t.Errorf("SERVER_COLLECTION_INTERVAL_MS default = %v, want 1s", cfg.Collector.ServerCollectionInterval)
	}
	if cfg.Collector.MindustryTimeout != time.Second {
		t.Errorf("MINDUSTRY_TIMEOUT_MS default = %v, want 1s", cfg.Collector.MindustryTimeout)
	}
	if cfg.Processor.QueuePollTimeout != 10*time.Second {
		t.Errorf("QUEUE_POLL_TIMEOUT_MS default = %v, want 10s", cfg.Processor.QueuePollTimeout)
	}
	if cfg.Collector.Concurrency < 4 {
		t.Errorf("COLLECTION_CONCURRENCY default = %d, want at least 4", cfg.Collector.Concurrency)
	}
	if cfg.DryRun {
		t.Error("DRY_RUN should default to off")
	}
}

func TestLoadReadsEnvironment(t *testing.T) {
	t.Setenv("DB_PASSWORD", "secret")
	t.Setenv("COLLECTION_CONCURRENCY", "32")
	t.Setenv("DATA_COLLECTION_INTERVAL_MS", "60000")
	t.Setenv("DRY_RUN", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Collector.Concurrency != 32 {
		t.Errorf("Concurrency = %d, want 32", cfg.Collector.Concurrency)
	}
	if cfg.Collector.DataCollectionInterval != time.Minute {
		t.Errorf("DataCollectionInterval = %v, want 1m", cfg.Collector.DataCollectionInterval)
	}
	if !cfg.DryRun {
		t.Error("DRY_RUN=true should enable dry run")
	}
	// p-queue's intervalCap was twice the concurrency.
	if cfg.Collector.IntervalCap() != 64 {
		t.Errorf("IntervalCap() = %d, want 64", cfg.Collector.IntervalCap())
	}
}

func TestLoadRejectsUnusableValues(t *testing.T) {
	t.Setenv("DB_PASSWORD", "secret")
	t.Setenv("COLLECTION_CONCURRENCY", "0")

	if _, err := Load(); err == nil {
		t.Fatal("Load() with COLLECTION_CONCURRENCY=0: want an error, got nil")
	}
}

func TestDSN(t *testing.T) {
	cfg := DBConfig{Host: "db", Port: 5432, Name: "mindustry_stats", User: "postgres", Password: "p@ss:word"}
	got := cfg.DSN()
	want := "postgres://postgres:p%40ss%3Aword@db:5432/mindustry_stats"
	if got != want {
		t.Errorf("DSN() = %q, want %q", got, want)
	}

	// DATABASE_URL, when set, is used verbatim.
	cfg.URL = "postgres://user@host/db?sslmode=require"
	if got := cfg.DSN(); got != cfg.URL {
		t.Errorf("DSN() = %q, want the explicit URL", got)
	}
}
