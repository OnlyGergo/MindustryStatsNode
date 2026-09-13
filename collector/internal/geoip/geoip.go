// Package geoip resolves an IP to a 2-letter country code.
//
// Replaces backend/src/utils/countryLookup.ts, which used ip3country's bundled
// dataset.  Here the database is an external .mmdb file refreshed out of band;
// Reload re-opens it so a refreshed file is picked up without a restart.
package geoip

import (
	"fmt"
	"log/slog"
	"net/netip"
	"sync"

	"github.com/oschwald/maxminddb-golang/v2"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/logging"
)

// Lookup is safe for concurrent use: the collector's workers all read through it
// while discovery swaps the reader underneath them.
type Lookup struct {
	path string
	log  *slog.Logger

	mu     sync.RWMutex
	reader *maxminddb.Reader
}

// New opens the database.  A missing or broken file is not fatal -- the country
// code is decoration on a server row, so lookups just return "" until a Reload
// finds a usable file.
func New(path string) *Lookup {
	l := &Lookup{path: path, log: logging.New("GeoIP")}
	if err := l.Reload(); err != nil {
		l.log.Warn("country lookup unavailable; country codes will be empty", "path", path, "err", err)
	}
	return l
}

// Reload re-opens the file and closes the previous reader once no lookup can
// still be inside it.
func (l *Lookup) Reload() error {
	reader, err := maxminddb.Open(l.path)
	if err != nil {
		return fmt.Errorf("open geoip database %q: %w", l.path, err)
	}

	l.mu.Lock()
	previous := l.reader
	l.reader = reader
	l.mu.Unlock()

	if previous != nil {
		if err := previous.Close(); err != nil {
			l.log.Warn("failed closing previous geoip reader", "err", err)
		}
	}

	l.log.Info("country lookup initialized", "path", l.path)
	return nil
}

// Country returns the ISO country code for an address, or "" when the address
// is unknown to the database (ip3country's null).
func (l *Lookup) Country(addr netip.Addr) string {
	if !addr.IsValid() {
		return ""
	}

	l.mu.RLock()
	reader := l.reader
	l.mu.RUnlock()

	if reader == nil {
		return ""
	}

	var isoCode string
	if err := reader.Lookup(addr).DecodePath(&isoCode, "country", "iso_code"); err != nil {
		l.log.Debug("country lookup failed", "ip", addr.String(), "err", err)
		return ""
	}
	if len(isoCode) != 2 {
		return ""
	}
	return isoCode
}

// CountryString is lookupCountryFromIPSync: the same lookup keyed by a textual
// address.
func (l *Lookup) CountryString(ip string) string {
	addr, err := netip.ParseAddr(ip)
	if err != nil {
		return ""
	}
	return l.Country(addr)
}

// Close releases the reader.
func (l *Lookup) Close() error {
	l.mu.Lock()
	reader := l.reader
	l.reader = nil
	l.mu.Unlock()

	if reader == nil {
		return nil
	}
	return reader.Close()
}
