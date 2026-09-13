// Package processor drains poll results and writes them to the database in
// batches.
//
// Port of backend/src/services/ServerProcessorService.ts, minus the in-memory
// serversList: the API reads server state from the database now, so there is no
// second copy of it to keep in sync.
package processor

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"sync"
	"time"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/collector"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/config"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/logging"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/repository"
)

// flushTimeout bounds the last drain during shutdown, so a wedged database
// cannot hold the process open.
const flushTimeout = 15 * time.Second

type Processor struct {
	cfg  config.ProcessorConfig
	repo *repository.Repository
	in   <-chan collector.RawServerData
	log  *slog.Logger
}

func New(cfg config.ProcessorConfig, repo *repository.Repository, in <-chan collector.RawServerData) *Processor {
	return &Processor{
		cfg:  cfg,
		repo: repo,
		in:   in,
		log:  logging.New("ServerProcessor"),
	}
}

// Run drains the queue every QUEUE_POLL_TIMEOUT_MS until ctx is cancelled.
//
// The TS version used setInterval, which started a new drain whether or not the
// previous one had finished (a todo in that file).  A single loop cannot
// overlap itself, so a slow write delays the next drain instead of racing it.
func (p *Processor) Run(ctx context.Context) error {
	p.log.Info("Starting Server Processor Service...", "poll_interval", p.cfg.QueuePollTimeout)

	ticker := time.NewTicker(p.cfg.QueuePollTimeout)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			// One last drain: the samples exist nowhere else, so dropping them
			// on shutdown would put a hole in every server's history.
			flushCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), flushTimeout)
			p.drain(flushCtx)
			cancel()
			p.log.Info("Server Processor Service stopped")
			return nil
		case <-ticker.C:
			p.drain(ctx)
		}
	}
}

func (p *Processor) drain(ctx context.Context) {
	batch := p.popAll()
	if len(batch) == 0 {
		return
	}
	p.ProcessBatch(ctx, batch)
}

// popAll empties the queue without blocking, the equivalent of
// InMemoryQueue.popAll on an already-populated queue.
func (p *Processor) popAll() []collector.RawServerData {
	var batch []collector.RawServerData
	for {
		select {
		case item := <-p.in:
			batch = append(batch, item)
		default:
			return batch
		}
	}
}

// batch is one drained cycle reshaped into the payloads the four writes take.
type batch struct {
	stats           []repository.StatRow
	onlineServerIDs []int
	motds           []repository.MotdEntry
	maps            []repository.MapEntry
	countries       []repository.CountryUpdate
}

// buildBatch turns raw poll results into rows.  Kept separate from the writes so
// the shaping -- which is where the TS parity actually lives -- can be tested
// without a database.
func buildBatch(raws []collector.RawServerData) batch {
	// Ascending timestamp so "last write wins" on the per-server maps means the
	// newest sample wins, whatever order the collector's concurrent workers
	// happened to finish in.
	ordered := make([]collector.RawServerData, len(raws))
	copy(ordered, raws)
	sort.SliceStable(ordered, func(i, j int) bool {
		return ordered[i].Timestamp.Before(ordered[j].Timestamp)
	})

	var (
		// One MOTD/map entry per server: the history tables keep a single open
		// row per server, so feeding them two entries for one server would leave
		// two rows marked current.  Stats are a time series and keep every
		// sample.
		motds     = newOrderedByServer[repository.MotdEntry]()
		maps      = newOrderedByServer[repository.MapEntry]()
		countries = newOrderedByServer[repository.CountryUpdate]()

		result batch
	)

	for _, raw := range ordered {
		data := raw.Data

		if data == nil || !raw.Online {
			// Offline sample: players defaults to 0 and everything else stays
			// NULL, which is the row Sequelize's DEFAULT-filled insert produced.
			result.stats = append(result.stats, repository.StatRow{
				ServerID:  raw.ServerID,
				Timestamp: raw.Timestamp,
				Players:   int32Ptr(0),
				Online:    false,
			})
			continue
		}

		motds.set(raw.ServerID, repository.MotdEntry{
			ServerID:    raw.ServerID,
			ServerName:  data.ServerName,
			Description: data.Description,
		})

		// mode_name rides along with the map (not just the MOTD) because the map
		// registry's gamemode link is keyed on (game_mode, mode_name) -- without
		// it every new registry row would collapse onto the nameless vanilla
		// gamemode.
		maps.set(raw.ServerID, repository.MapEntry{
			ServerID: raw.ServerID,
			MapName:  data.MapName,
			GameMode: int(data.Mode),
			ModeName: data.ModeName,
		})

		if data.CountryCode != "" {
			countries.set(raw.ServerID, repository.CountryUpdate{
				ServerID:    raw.ServerID,
				CountryCode: data.CountryCode,
			})
		}

		result.stats = append(result.stats, repository.StatRow{
			ServerID:    raw.ServerID,
			Timestamp:   raw.Timestamp,
			Players:     int32Ptr(data.Players),
			MaxPlayers:  int32Ptr(data.PlayerLimit),
			Wave:        int32Ptr(data.Wave),
			Version:     int32Ptr(data.Version),
			VersionType: stringPtr(data.VersionType),
			Ping:        int32Ptr(int32(data.Ping)),
			Online:      true,
		})
		result.onlineServerIDs = append(result.onlineServerIDs, raw.ServerID)
	}

	result.motds = motds.all()
	result.maps = maps.all()
	result.countries = countries.all()
	return result
}

// ProcessBatch turns one drained batch into the four writes it implies.
func (p *Processor) ProcessBatch(ctx context.Context, raws []collector.RawServerData) {
	b := buildBatch(raws)
	statsToInsert := b.stats
	onlineServerIDs := b.onlineServerIDs

	motdEntries := b.motds
	mapEntries := b.maps

	p.log.Debug("Saving batch",
		"samples", len(raws), "stats", len(statsToInsert),
		"motds", len(motdEntries), "maps", len(mapEntries))

	// The writes below are independent, and only the stats one carries the
	// player numbers.  Settling them separately means a MOTD or map failure no
	// longer takes the whole poll cycle's player history down with it.
	var (
		wg                   sync.WaitGroup
		lastSeenErr, motdErr error
		mapErr, countryErr   error
		motdRegistry         map[int]int
		mapRegistry          map[int]int
	)

	wg.Add(4)
	go func() {
		defer wg.Done()
		lastSeenErr = p.repo.BulkUpdateLastSeen(ctx, onlineServerIDs)
	}()
	go func() {
		defer wg.Done()
		motdRegistry, motdErr = p.repo.BulkSaveMotds(ctx, motdEntries)
	}()
	go func() {
		defer wg.Done()
		mapRegistry, mapErr = p.repo.BulkSaveMaps(ctx, mapEntries)
	}()
	go func() {
		defer wg.Done()
		countryErr = p.repo.BulkUpdateCountryCodes(ctx, b.countries)
	}()
	wg.Wait()

	p.reportFailure(lastSeenErr, "last-seen update", slog.Int("servers", len(onlineServerIDs)))
	p.reportFailure(motdErr, "MOTD history write", slog.Int("entries", len(motdEntries)))
	p.reportFailure(mapErr, "map history write", slog.Int("entries", len(mapEntries)))
	p.reportFailure(countryErr, "country code update", slog.Int("entries", len(b.countries)))

	// A failed registry write leaves its IDs null rather than blocking the
	// sample: the player count is the point, and the FK is nullable.
	for i := range statsToInsert {
		if id, ok := motdRegistry[statsToInsert[i].ServerID]; ok {
			statsToInsert[i].MotdRegistryID = intPtr(id)
		} else if statsToInsert[i].Online {
			p.log.Error("MOTD registry lookup failed for online server", slog.Int("server_id", statsToInsert[i].ServerID))
		}
		if id, ok := mapRegistry[statsToInsert[i].ServerID]; ok {
			statsToInsert[i].MapRegistryID = intPtr(id)
		} else if statsToInsert[i].Online {
			p.log.Error("Map registry lookup failed for online server", slog.Int("server_id", statsToInsert[i].ServerID))
		}
	}

	if err := p.repo.BulkSaveServerStats(ctx, statsToInsert); err != nil {
		// This is the lossy one: the samples are only held in the batch, so a
		// failure here discards this cycle's player history outright.  Say how
		// much was lost, for which servers, and exactly why.
		servers := make(map[int]struct{}, len(statsToInsert))
		ids := make([]int, 0, len(statsToInsert))
		for _, stat := range statsToInsert {
			if _, seen := servers[stat.ServerID]; seen {
				continue
			}
			servers[stat.ServerID] = struct{}{}
			ids = append(ids, stat.ServerID)
		}
		p.log.Error("Player stats write failed - sample(s) were lost",
			"samples", len(statsToInsert),
			"servers", len(servers),
			"server_ids", summariseIDs(ids, 20),
			"err", err)
		return
	}

	p.log.Debug("Processed batch",
		"samples", len(raws), "stats", len(statsToInsert),
		"motds", len(motdEntries), "maps", len(mapEntries))
}

// reportFailure logs a failed write with its context; a nil error is ignored.
func (p *Processor) reportFailure(err error, stage string, context ...slog.Attr) {
	if err == nil {
		return
	}
	args := make([]any, 0, len(context)+2)
	for _, attr := range context {
		args = append(args, attr)
	}
	args = append(args, slog.Any("err", err))
	p.log.Error(stage+" failed", args...)
}

// summariseIDs caps an ID list so one broken batch cannot dump thousands of IDs
// into a log line.
func summariseIDs(ids []int, limit int) string {
	if len(ids) <= limit {
		return joinInts(ids)
	}
	return fmt.Sprintf("%s (+%d more)", joinInts(ids[:limit]), len(ids)-limit)
}

func int32Ptr(v int32) *int32 { return &v }
func intPtr(v int) *int       { return &v }
func stringPtr(v string) *string {
	return &v
}
