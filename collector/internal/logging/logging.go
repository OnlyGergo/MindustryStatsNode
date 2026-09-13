// Package logging gives every component a named slog logger, rendering lines in
// the same shape the TS side's winston format produced:
//
//	2026-09-01 12:00:00.000 INFO  [ServerProcessor] Processed batch rows=42
package logging

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"
)

const componentKey = "component"

// ANSI color codes for terminal output. Never written when the destination
// isn't a real terminal (e.g. redirected to a file or piped).
const (
	colorReset = "\x1b[0m"

	// Error lines: whole line in a muted "watercolor" red, ERROR keyword in
	// the brightest red so it pops out of a scrolling log.
	colorErrLine = "\x1b[38;5;131m"
	colorErrWord = "\x1b[1;38;5;196m"

	// Non-error lines: white message text, columns tinted for scanning.
	colorTimestamp = "\x1b[38;5;244m"
	colorLevel     = "\x1b[38;5;253m"
	colorComponent = "\x1b[38;5;73m"
	colorMessage   = "\x1b[38;5;255m"
	colorAttrKey   = "\x1b[38;5;179m"
	colorAttrVal   = "\x1b[38;5;250m"
)

var (
	root  *slog.Logger
	level = new(slog.LevelVar)
)

func init() {
	level.Set(slog.LevelInfo)
	root = slog.New(&handler{w: os.Stdout, mu: &sync.Mutex{}, level: level, color: isTerminal(os.Stdout)})
}

// Init sets the global level from LOG_LEVEL.  Unknown values keep info, which
// is what winston does with a level it does not recognise.
func Init(logLevel string) {
	switch strings.ToLower(strings.TrimSpace(logLevel)) {
	case "debug", "verbose", "silly", "trace":
		level.Set(slog.LevelDebug)
	case "warn", "warning":
		level.Set(slog.LevelWarn)
	case "error":
		level.Set(slog.LevelError)
	default:
		level.Set(slog.LevelInfo)
	}
}

// New returns a logger tagged with a component name, the equivalent of
// createLogger('ServerProcessor').
func New(component string) *slog.Logger {
	return root.With(slog.String(componentKey, component))
}

// Enabled reports whether a level would be written, so callers can skip
// building an expensive debug message.
func Enabled(l slog.Level) bool { return level.Level() <= l }

// isTerminal reports whether w is an interactive terminal. Used to decide
// whether to emit ANSI color codes: files and pipes report false here, so
// redirected/logged output never picks up escape sequences.
func isTerminal(w io.Writer) bool {
	f, ok := w.(*os.File)
	if !ok {
		return false
	}
	info, err := f.Stat()
	if err != nil {
		return false
	}
	return info.Mode()&os.ModeCharDevice != 0
}

type handler struct {
	w     io.Writer
	mu    *sync.Mutex
	level *slog.LevelVar
	attrs []slog.Attr
	color bool
}

func (h *handler) Enabled(_ context.Context, l slog.Level) bool {
	return l >= h.level.Level()
}

func (h *handler) Handle(_ context.Context, r slog.Record) error {
	levelStr := fmt.Sprintf("%-5s", r.Level.String())
	timestamp := r.Time.Format("2006-01-02 15:04:05.000")

	attrs := make([]slog.Attr, 0, len(h.attrs)+r.NumAttrs())
	component := ""
	for _, a := range h.attrs {
		if a.Key == componentKey {
			component = a.Value.String()
			continue
		}
		attrs = append(attrs, a)
	}
	r.Attrs(func(a slog.Attr) bool {
		if a.Key == componentKey {
			component = a.Value.String()
			return true
		}
		attrs = append(attrs, a)
		return true
	})

	var sb strings.Builder
	isErr := r.Level >= slog.LevelError

	switch {
	case h.color && isErr:
		// Whole line stays in the muted red; only the level word jumps to
		// the brightest red. No resets in between so the color is continuous.
		sb.WriteString(colorErrLine)
		sb.WriteString(timestamp)
		sb.WriteString(" ")
		sb.WriteString(colorErrWord)
		sb.WriteString(levelStr)
		sb.WriteString(colorErrLine)
		if component != "" {
			sb.WriteString(" [")
			sb.WriteString(component)
			sb.WriteString("]")
		}
		sb.WriteString(" ")
		sb.WriteString(r.Message)
		for _, a := range attrs {
			sb.WriteString(" ")
			sb.WriteString(a.Key)
			sb.WriteString("=")
			sb.WriteString(quote(a.Value))
		}
		sb.WriteString(colorReset)

	case h.color:
		sb.WriteString(colorTimestamp)
		sb.WriteString(timestamp)
		sb.WriteString(colorReset)
		sb.WriteString(" ")
		sb.WriteString(colorLevel)
		sb.WriteString(levelStr)
		sb.WriteString(colorReset)
		if component != "" {
			sb.WriteString(" ")
			sb.WriteString(colorComponent)
			sb.WriteString("[")
			sb.WriteString(component)
			sb.WriteString("]")
			sb.WriteString(colorReset)
		}
		sb.WriteString(" ")
		sb.WriteString(colorMessage)
		sb.WriteString(r.Message)
		sb.WriteString(colorReset)
		for _, a := range attrs {
			sb.WriteString(" ")
			sb.WriteString(colorAttrKey)
			sb.WriteString(a.Key)
			sb.WriteString(colorReset)
			sb.WriteString("=")
			sb.WriteString(colorAttrVal)
			sb.WriteString(quote(a.Value))
			sb.WriteString(colorReset)
		}

	default:
		sb.WriteString(timestamp)
		sb.WriteString(" ")
		sb.WriteString(levelStr)
		if component != "" {
			sb.WriteString(" [")
			sb.WriteString(component)
			sb.WriteString("]")
		}
		sb.WriteString(" ")
		sb.WriteString(r.Message)
		for _, a := range attrs {
			sb.WriteString(" ")
			sb.WriteString(a.Key)
			sb.WriteString("=")
			sb.WriteString(quote(a.Value))
		}
	}

	sb.WriteString("\n")

	h.mu.Lock()
	defer h.mu.Unlock()
	_, err := io.WriteString(h.w, sb.String())
	return err
}

func (h *handler) WithAttrs(attrs []slog.Attr) slog.Handler {
	merged := make([]slog.Attr, 0, len(h.attrs)+len(attrs))
	merged = append(merged, h.attrs...)
	merged = append(merged, attrs...)
	return &handler{w: h.w, mu: h.mu, level: h.level, attrs: merged, color: h.color}
}

// Groups are unused; keeping the handler flat keeps the lines readable.
func (h *handler) WithGroup(string) slog.Handler { return h }

func quote(v slog.Value) string {
	switch v.Kind() {
	case slog.KindString:
		s := v.String()
		if s == "" || strings.ContainsAny(s, " \t\"=") {
			return fmt.Sprintf("%q", s)
		}
		return s
	case slog.KindDuration:
		return v.Duration().String()
	case slog.KindTime:
		return v.Time().Format(time.RFC3339Nano)
	case slog.KindAny:
		if err, ok := v.Any().(error); ok {
			return fmt.Sprintf("%q", err.Error())
		}
		return fmt.Sprintf("%q", fmt.Sprint(v.Any()))
	default:
		return v.String()
	}
}