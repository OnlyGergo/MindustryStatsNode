package logging

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	dayLayout  = "2006-01-02"
	allPrefix  = "collector"
	errPrefix  = "collector-error"
	fileSuffix = ".log"
)

// dailyFile appends to <dir>/<prefix>-YYYY-MM-DD.log, switching file at local
// midnight and deleting its own files older than keepDays on every switch.
// It is not safe for concurrent use; sinks serialises access.
type dailyFile struct {
	dir      string
	prefix   string
	keepDays int

	day string
	f   *os.File
}

func (d *dailyFile) Write(p []byte) (int, error) {
	now := time.Now()
	if day := now.Format(dayLayout); d.f == nil || day != d.day {
		if err := d.rotate(now); err != nil {
			return 0, err
		}
	}
	return d.f.Write(p)
}

func (d *dailyFile) rotate(now time.Time) error {
	if d.f != nil {
		_ = d.f.Close()
		d.f = nil
	}
	name := filepath.Join(d.dir, d.prefix+"-"+now.Format(dayLayout)+fileSuffix)
	f, err := os.OpenFile(name, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	d.f, d.day = f, now.Format(dayLayout)
	d.prune(now)
	return nil
}

// prune removes files of this prefix dated before today minus keepDays, so
// keepDays=7 leaves today plus the previous seven days. Names that don't parse
// as <prefix>-<date>.log (including the other tier's files) are left alone.
func (d *dailyFile) prune(now time.Time) {
	entries, err := os.ReadDir(d.dir)
	if err != nil {
		return
	}
	y, m, day := now.Date()
	cutoff := time.Date(y, m, day, 0, 0, 0, 0, now.Location()).AddDate(0, 0, -d.keepDays)
	for _, e := range entries {
		date, ok := strings.CutPrefix(e.Name(), d.prefix+"-")
		if !ok {
			continue
		}
		date, ok = strings.CutSuffix(date, fileSuffix)
		if !ok {
			continue
		}
		t, err := time.ParseInLocation(dayLayout, date, now.Location())
		if err != nil || !t.Before(cutoff) {
			continue
		}
		_ = os.Remove(filepath.Join(d.dir, e.Name()))
	}
}

// sinks fans a finished line out to the file tiers: every line goes to the
// short-retention file, errors additionally to the long-retention one.
type sinks struct {
	mu   sync.Mutex
	all  *dailyFile
	errs *dailyFile
}

func (s *sinks) write(isErr bool, line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// A failing disk must never take the collector down; stdout still has it.
	if s.all != nil {
		_, _ = s.all.Write([]byte(line))
	}
	if isErr && s.errs != nil {
		_, _ = s.errs.Write([]byte(line))
	}
}

// InitFiles starts tiered file logging in dir: collector-<date>.log holds every
// line for keepDays, collector-error-<date>.log holds only errors for
// keepErrDays. Files are plain text (no colour codes). An empty dir disables it.
func InitFiles(dir string, keepDays, keepErrDays int) error {
	if dir == "" {
		return nil
	}
	if keepDays < 1 || keepErrDays < 1 {
		return fmt.Errorf("log retention must be at least 1 day (got %d and %d)", keepDays, keepErrDays)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	all := &dailyFile{dir: dir, prefix: allPrefix, keepDays: keepDays}
	errs := &dailyFile{dir: dir, prefix: errPrefix, keepDays: keepErrDays}
	// Open eagerly so a bad directory fails at startup, and old files get pruned.
	now := time.Now()
	if err := all.rotate(now); err != nil {
		return err
	}
	if err := errs.rotate(now); err != nil {
		return err
	}
	files.mu.Lock()
	files.all, files.errs = all, errs
	files.mu.Unlock()
	return nil
}
