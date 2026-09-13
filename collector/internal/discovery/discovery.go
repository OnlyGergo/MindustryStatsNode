// Package discovery fetches the public server lists and records what they
// contain.
//
// Port of backend/src/services/ServerDiscoveryService.ts, plus the geoip
// reload: the .mmdb file is refreshed out of band, and the end of a discovery
// cycle is the natural point to pick a new one up.
package discovery

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/config"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/geoip"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/logging"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/mindustry"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/repository"
)

// defaultPort is Mindustry's default server port, used when an address carries
// no port.
const defaultPort = 6567

// maxResponseBytes bounds a serverlist response; the real ones are a few
// hundred KB.
const maxResponseBytes = 32 << 20

// serverListElement is backend/src/models/ServerListElement.ts: one server
// group and every address it answers on.
type serverListElement struct {
	Name    string   `json:"name"`
	Address []string `json:"address"`
}

type Discovery struct {
	cfg    config.DiscoveryConfig
	repo   *repository.Repository
	geo    *geoip.Lookup
	client *http.Client
	log    *slog.Logger
}

func New(cfg config.DiscoveryConfig, repo *repository.Repository, geo *geoip.Lookup) *Discovery {
	return &Discovery{
		cfg:    cfg,
		repo:   repo,
		geo:    geo,
		client: &http.Client{Timeout: cfg.FetchTimeout},
		log:    logging.New("ServerDiscovery"),
	}
}

// Run refreshes the server list now and then every SERVER_LIST_INTERVAL_MS.
func (d *Discovery) Run(ctx context.Context) error {
	d.log.Info("Starting Server Discovery Service...", "refresh_interval", d.cfg.ServerListInterval)

	if err := d.RefreshServerList(ctx); err != nil && ctx.Err() == nil {
		d.log.Error("Error refreshing server list", "err", err)
	}

	ticker := time.NewTicker(d.cfg.ServerListInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			d.log.Info("Server Discovery Service stopped")
			return nil
		case <-ticker.C:
			if err := d.RefreshServerList(ctx); err != nil && ctx.Err() == nil {
				d.log.Error("Error in scheduled server list refresh", "err", err)
			}
		}
	}
}

// RefreshServerList fetches every configured source, upserts what it finds and
// prunes the memberships that disappeared.
func (d *Discovery) RefreshServerList(ctx context.Context) error {
	start := time.Now()
	d.log.Info("Refreshing servers...")

	serverlists, err := d.repo.GetAllServerLists(ctx)
	if err != nil {
		return err
	}

	var (
		discovered []repository.ServerInput
		sources    []repository.SourceListEntry
		groupCount int
	)

	for _, serverlist := range serverlists {
		d.log.Info("Fetching servers from list", "url", serverlist.URL)

		groups, err := d.fetch(ctx, serverlist.URL)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			d.log.Warn("Failed to fetch server list", "url", serverlist.URL, "err", err)
			continue
		}
		groupCount += len(groups)

		for _, group := range groups {
			for _, address := range group.Address {
				host, port := splitAddress(address)
				if host == "" {
					d.log.Debug("Skipping empty address", "url", serverlist.URL, "group", group.Name)
					continue
				}

				discovered = append(discovered, repository.ServerInput{
					Name: group.Name,
					Host: host,
					Port: port,
				})
				sources = append(sources, repository.SourceListEntry{
					Host:         host,
					Port:         port,
					ServerListID: serverlist.ID,
					DisplayName:  group.Name,
				})
			}
		}
	}

	// Batch upsert all discovered servers to database.
	if err := d.repo.BatchUpsertServers(ctx, discovered); err != nil {
		return err
	}

	// Refresh server source list tracking.
	if err := d.repo.RefreshServerSourceList(ctx, sources); err != nil {
		return err
	}

	// The mmdb file is refreshed externally; re-opening it here is what picks
	// that up without a restart.
	if err := d.geo.Reload(); err != nil {
		d.log.Warn("Failed to reload geoip database", "err", err)
	}

	d.log.Info("Server list refresh complete",
		"groups", groupCount, "addresses", len(discovered), "took", time.Since(start).Round(time.Millisecond))
	return nil
}

func (d *Discovery) fetch(ctx context.Context, url string) ([]serverListElement, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	resp, err := d.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected status %s", resp.Status)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	var groups []serverListElement
	if err := json.Unmarshal(body, &groups); err != nil {
		return nil, fmt.Errorf("decode server list: %w", err)
	}

	// A serverlist is a third party's file: its names end up in server_groups,
	// so they get the same sanitising the poller's strings do.
	for i := range groups {
		groups[i].Name = mindustry.SanitizeText(groups[i].Name)
	}
	return groups, nil
}

// splitAddress parses a "host" or "host:port" entry.
//
// Deliberately matching the TS: it split on every ':' and read element [1], so
// the port of a bracketless IPv6 address is whatever sits between the first two
// colons -- which parses as no port and falls back to the default.
func splitAddress(address string) (host string, port int) {
	if !strings.Contains(address, ":") {
		return strings.TrimSpace(address), defaultPort
	}

	parts := strings.Split(address, ":")
	host = strings.TrimSpace(parts[0])
	if parsed, ok := config.ParseIntPrefix(parts[1]); ok && parsed != 0 {
		return host, parsed
	}
	return host, defaultPort
}
