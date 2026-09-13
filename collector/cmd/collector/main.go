// Command collector owns the Mindustry stats write path: migrations,
// discovery, polling and every database write.  The TypeScript backend keeps
// the API and SSR reads.
//
// Wiring mirrors backend/src/index.ts, including its SIGTERM/SIGINT graceful
// shutdown.
package main

import (
	"context"
	"errors"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/collector"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/config"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/db"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/discovery"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/geoip"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/logging"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/poller"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/processor"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/repository"
)

func main() {
	if err := run(); err != nil {
		logging.New("Main").Error("Failed to start application", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	logging.Init(cfg.LogLevel)
	log := logging.New("Main")

	log.Info("=========== Starting Mindustry Stats Collector ===========")
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	log.Info("Working Directory", "dir", cwd)
	if cfg.DryRun {
		log.Warn("DRY_RUN is set: every loop runs, but no write reaches the database")
	}

	// SIGTERM/SIGINT cancel the root context, which is what every loop shuts
	// down on.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	pool, err := db.New(ctx, cfg.DB)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := db.Init(ctx, pool, cfg); err != nil {
		var manual *db.ErrManualMigration
		if errors.As(err, &manual) {
			// database.ts exited here too: the migration has to be applied by
			// hand before anything may write against the new schema.
			log.Error("Exiting to allow the migration to be run", "err", err)
		}
		return err
	}

	geo := geoip.New(cfg.GeoIP.Path)
	defer geo.Close()

	repo := repository.New(pool, cfg.DryRun)

	// The queue between the pollers and the writer.  Bounded, so a stalled
	// processor slows the pollers down instead of growing without limit.
	rawData := make(chan collector.RawServerData, cfg.Collector.RawQueueCapacity)

	discoveryService := discovery.New(cfg.Discovery, repo, geo)
	collectorService := collector.New(cfg.Collector, repo, poller.New(cfg.Collector.MindustryTimeout, geo), rawData)
	processorService := processor.New(cfg.Processor, repo, rawData)

	var wg sync.WaitGroup
	run := func(name string, fn func(context.Context) error) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := fn(ctx); err != nil && !errors.Is(err, context.Canceled) {
				log.Error("Service stopped with an error", "service", name, "err", err)
			}
		}()
	}

	// The processor outlives the signal by design: it is cancelled only once the
	// collector's in-flight queries have all been pushed, so its final flush
	// sees the whole last cycle rather than racing the pollers for it.
	processorCtx, stopProcessor := context.WithCancel(context.WithoutCancel(ctx))
	defer stopProcessor()

	run("discovery", discoveryService.Run)
	run("collector", func(ctx context.Context) error {
		defer stopProcessor()
		return collectorService.Run(ctx)
	})
	run("processor", func(context.Context) error {
		return processorService.Run(processorCtx)
	})

	log.Info("=== All services started successfully ===",
		"collection_concurrency", cfg.Collector.Concurrency,
		"collection_interval", cfg.Collector.DataCollectionInterval,
		"queue_poll_interval", cfg.Processor.QueuePollTimeout,
		"server_list_interval", cfg.Discovery.ServerListInterval,
	)

	<-ctx.Done()
	log.Info("Received shutdown signal, shutting down gracefully...")

	wg.Wait()
	log.Info("Graceful shutdown complete")
	return nil
}
