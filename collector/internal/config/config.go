// Package config parses the collector's environment.
//
// The variable names are the ones backend/src/shared/config.ts and
// backend/src/index.ts already read, so a deployment keeps the same .env after
// the write path moves from TS to Go.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// DBConfig mirrors backend/src/config/env.ts's DB_* block.
type DBConfig struct {
	Host     string
	Port     int
	Name     string
	User     string
	Password string
	// URL, when set (DATABASE_URL), wins over the individual fields.
	URL string
	// MaxConns mirrors the Sequelize pool's `max`.
	MaxConns int32
	MinConns int32
}

// DSN renders the connection string handed to pgxpool.
func (d DBConfig) DSN() string {
	if d.URL != "" {
		return d.URL
	}
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s",
		url(d.User), url(d.Password), d.Host, d.Port, d.Name,
	)
}

type DiscoveryConfig struct {
	// ServerListInterval is SERVER_LIST_INTERVAL_MS (default 24h).
	ServerListInterval time.Duration
	// FetchTimeout bounds one serverlist HTTP fetch.
	FetchTimeout time.Duration
}

type CollectorConfig struct {
	// Concurrency is COLLECTION_CONCURRENCY: how many servers are queried at once.
	Concurrency int
	// MindustryTimeout is MINDUSTRY_TIMEOUT_MS: the UDP response deadline.
	MindustryTimeout time.Duration
	// DataCollectionInterval is DATA_COLLECTION_INTERVAL_MS: how often the whole
	// server list is re-queued.
	DataCollectionInterval time.Duration
	// ServerCollectionInterval is SERVER_COLLECTION_INTERVAL_MS: the window the
	// rate limit below applies to (p-queue's `interval`).
	ServerCollectionInterval time.Duration
	// RawQueueCapacity bounds the poll-result channel.  p-queue's TS counterpart
	// was unbounded; a bound turns a stalled processor into backpressure on the
	// pollers rather than unbounded memory growth.
	RawQueueCapacity int
}

// IntervalCap is p-queue's `intervalCap`: the most tasks that may *start*
// within one ServerCollectionInterval.  ServerCollectorService.ts set it to
// twice the concurrency.
func (c CollectorConfig) IntervalCap() int {
	return c.Concurrency * 2
}

type ProcessorConfig struct {
	// QueuePollTimeout is QUEUE_POLL_TIMEOUT_MS: how often the raw queue is drained.
	QueuePollTimeout time.Duration
}

type GeoIPConfig struct {
	// Path is the .mmdb file, refreshed out of band by whatever updates it.
	Path string
	// ReloadInterval re-opens the file so an external refresh is picked up.
	// Discovery also reopens it at the end of every cycle.
	ReloadInterval time.Duration
}

type Config struct {
	NodeEnv  string
	LogLevel string

	DB            DBConfig
	MigrationsDir string

	Discovery DiscoveryConfig
	Collector CollectorConfig
	Processor ProcessorConfig
	GeoIP     GeoIPConfig

	// DryRun runs every loop and every read, but skips the statements that would
	// change data, logging what they would have written instead.  This is
	// migration step 8's validation pass.
	DryRun bool
}

// Load reads the environment (after loading .env files, as dotenv does for the
// TS side) and applies the same defaults index.ts used.
func Load() (Config, error) {
	loadEnvFiles()

	cfg := Config{
		NodeEnv:  str("NODE_ENV", "development"),
		LogLevel: str("LOG_LEVEL", "info"),

		DB: DBConfig{
			Host:     str("DB_HOST", "localhost"),
			Port:     intVal("DB_PORT", 5432),
			Name:     str("DB_NAME", "mindustry_stats"),
			User:     str("DB_USER", "postgres"),
			Password: str("DB_PASSWORD", ""),
			URL:      str("DATABASE_URL", ""),
			MaxConns: int32(intVal("DB_POOL_MAX", 20)),
			MinConns: int32(intVal("DB_POOL_MIN", 5)),
		},
		MigrationsDir: str("MIGRATIONS_DIR", defaultMigrationsDir()),

		Discovery: DiscoveryConfig{
			ServerListInterval: msVal("SERVER_LIST_INTERVAL_MS", 86_400_000),
			FetchTimeout:       msVal("SERVER_LIST_FETCH_TIMEOUT_MS", 30_000),
		},
		Collector: CollectorConfig{
			Concurrency:              intVal("COLLECTION_CONCURRENCY", defaultConcurrency()),
			MindustryTimeout:         msVal("MINDUSTRY_TIMEOUT_MS", 1_000),
			DataCollectionInterval:   msVal("DATA_COLLECTION_INTERVAL_MS", 300_000),
			ServerCollectionInterval: msVal("SERVER_COLLECTION_INTERVAL_MS", 1_000),
			RawQueueCapacity:         intVal("RAW_QUEUE_CAPACITY", 100_000),
		},
		Processor: ProcessorConfig{
			QueuePollTimeout: msVal("QUEUE_POLL_TIMEOUT_MS", 10_000),
		},
		GeoIP: GeoIPConfig{
			Path:           str("GEOIP_MMDB_PATH", "./geoip/country.mmdb"),
			ReloadInterval: msVal("GEOIP_RELOAD_INTERVAL_MS", 86_400_000),
		},

		DryRun: boolVal("DRY_RUN", false),
	}

	return cfg, cfg.validate()
}

func (c Config) validate() error {
	if c.Collector.Concurrency < 1 {
		return fmt.Errorf("COLLECTION_CONCURRENCY must be at least 1, got %d", c.Collector.Concurrency)
	}
	if c.Collector.RawQueueCapacity < 1 {
		return fmt.Errorf("RAW_QUEUE_CAPACITY must be at least 1, got %d", c.Collector.RawQueueCapacity)
	}
	for name, d := range map[string]time.Duration{
		"SERVER_LIST_INTERVAL_MS":       c.Discovery.ServerListInterval,
		"MINDUSTRY_TIMEOUT_MS":          c.Collector.MindustryTimeout,
		"DATA_COLLECTION_INTERVAL_MS":   c.Collector.DataCollectionInterval,
		"SERVER_COLLECTION_INTERVAL_MS": c.Collector.ServerCollectionInterval,
		"QUEUE_POLL_TIMEOUT_MS":         c.Processor.QueuePollTimeout,
	} {
		if d <= 0 {
			return fmt.Errorf("%s must be positive, got %s", name, d)
		}
	}
	return nil
}

// getDefaultConcurrency() from index.ts.
func defaultConcurrency() int {
	if n := int(float64(runtime.NumCPU()) * 1.5); n > 4 {
		return n
	}
	return 4
}

// The collector runs from the repo root or from collector/, and the migrations
// live in backend/migrations either way.
func defaultMigrationsDir() string {
	for _, candidate := range []string{"../../migrations", "migrations"} {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			abs, err := filepath.Abs(candidate)
			if err == nil {
				return abs
			}
			return candidate
		}
	}
	return "migrations"
}

// dotenv.config() equivalent.  Existing environment variables always win, which
// is godotenv.Load's behaviour and dotenv's.
func loadEnvFiles() {
	if explicit := os.Getenv("ENV_FILE"); explicit != "" {
		_ = godotenv.Load(explicit)
		return
	}
	for _, candidate := range []string{".env", "backend/.env", "../backend/.env"} {
		if _, err := os.Stat(candidate); err == nil {
			_ = godotenv.Load(candidate)
		}
	}
}

func str(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func intVal(key string, fallback int) int {
	raw, ok := os.LookupEnv(key)
	if !ok || raw == "" {
		return fallback
	}
	// parseInt() semantics: a trailing suffix is ignored rather than fatal.
	n, ok := ParseIntPrefix(raw)
	if !ok {
		return fallback
	}
	return n
}

func msVal(key string, fallbackMs int) time.Duration {
	return time.Duration(intVal(key, fallbackMs)) * time.Millisecond
}

func boolVal(key string, fallback bool) bool {
	raw, ok := os.LookupEnv(key)
	if !ok || raw == "" {
		return fallback
	}
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	}
	return fallback
}

// ParseIntPrefix mirrors JavaScript's parseInt: leading whitespace and an
// optional sign, then as many digits as are there, ignoring the rest.
func ParseIntPrefix(s string) (int, bool) {
	s = strings.TrimSpace(s)
	end := 0
	if end < len(s) && (s[end] == '+' || s[end] == '-') {
		end++
	}
	digits := end
	for digits < len(s) && s[digits] >= '0' && s[digits] <= '9' {
		digits++
	}
	if digits == end {
		return 0, false
	}
	n, err := strconv.Atoi(s[:digits])
	if err != nil {
		return 0, false
	}
	return n, true
}

// url percent-encodes the credential parts of a DSN.
func url(s string) string {
	replacer := strings.NewReplacer(
		"%", "%25", ":", "%3A", "/", "%2F", "?", "%3F", "#", "%23",
		"[", "%5B", "]", "%5D", "@", "%40", " ", "%20",
	)
	return replacer.Replace(s)
}
