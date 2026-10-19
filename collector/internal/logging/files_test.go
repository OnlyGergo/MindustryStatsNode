package logging

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPruneKeepsTierWindows(t *testing.T) {
	dir := t.TempDir()
	now := time.Now()
	for _, prefix := range []string{allPrefix, errPrefix} {
		for _, age := range []int{0, 7, 8, 14, 15} {
			name := prefix + "-" + now.AddDate(0, 0, -age).Format(dayLayout) + fileSuffix
			if err := os.WriteFile(filepath.Join(dir, name), nil, 0o644); err != nil {
				t.Fatal(err)
			}
		}
	}
	(&dailyFile{dir: dir, prefix: allPrefix, keepDays: 7}).prune(now)
	(&dailyFile{dir: dir, prefix: errPrefix, keepDays: 14}).prune(now)

	left := map[string]bool{}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		left[e.Name()] = true
	}
	has := func(prefix string, age int) bool {
		return left[prefix+"-"+now.AddDate(0, 0, -age).Format(dayLayout)+fileSuffix]
	}
	if !has(allPrefix, 7) || has(allPrefix, 8) {
		t.Errorf("all tier should keep 7 days: %v", left)
	}
	if !has(errPrefix, 14) || has(errPrefix, 15) {
		t.Errorf("error tier should keep 14 days: %v", left)
	}
}

func TestFilesGetPlainLinesAndErrorsTiered(t *testing.T) {
	dir := t.TempDir()
	if err := InitFiles(dir, 7, 14); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { files.mu.Lock(); files.all, files.errs = nil, nil; files.mu.Unlock() })

	log := New("T")
	log.Info("hello", "a", 1)
	log.Error("boom", "server_id", 5)

	day := time.Now().Format(dayLayout)
	all, _ := os.ReadFile(filepath.Join(dir, allPrefix+"-"+day+fileSuffix))
	errs, _ := os.ReadFile(filepath.Join(dir, errPrefix+"-"+day+fileSuffix))
	if !strings.Contains(string(all), "INFO  [T] hello a=1") || !strings.Contains(string(all), "ERROR [T] boom") {
		t.Errorf("all log missing lines: %q", all)
	}
	if strings.Contains(string(errs), "hello") || !strings.Contains(string(errs), "boom server_id=5") {
		t.Errorf("error log wrong: %q", errs)
	}
	if strings.Contains(string(all), "\x1b") {
		t.Errorf("colour codes leaked into file")
	}
}
