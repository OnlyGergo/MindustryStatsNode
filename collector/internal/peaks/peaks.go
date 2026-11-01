// Package peaks keeps network_peaks current.  A network's all-time peak is a
// sum across its families per hour, so unlike server_peaks it cannot be folded
// in per sample batch; this loop recomputes it from the hourly aggregate
// instead (see 44_network_peaks.sql).
package peaks

import (
	"context"
	"log/slog"
	"time"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/config"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/logging"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/repository"
)

type Service struct {
	cfg  config.PeaksConfig
	repo *repository.Repository
	log  *slog.Logger
}

func New(cfg config.PeaksConfig, repo *repository.Repository) *Service {
	return &Service{cfg: cfg, repo: repo, log: logging.New("NetworkPeaks")}
}

// Run rebuilds every network's peak from all history once on start, then
// refreshes the last Lookback of buckets every RefreshInterval and rebuilds
// again every RebuildInterval.  Rebuilding on start matters: the ticker
// restarts with the process, so a collector restarted more often than
// RebuildInterval would otherwise never run a full rebuild, and peaks a
// merge or regroup should have lowered would stay high.  Run is its own
// goroutine, so the start-up rebuild never holds up the other services.
func (s *Service) Run(ctx context.Context) error {
	refresh := time.NewTicker(s.cfg.RefreshInterval)
	defer refresh.Stop()
	rebuild := time.NewTicker(s.cfg.RebuildInterval)
	defer rebuild.Stop()

	s.log.Info("Network peaks service started",
		"refresh_interval", s.cfg.RefreshInterval,
		"lookback", s.cfg.Lookback,
		"rebuild_interval", s.cfg.RebuildInterval,
	)
	// The full rebuild reads every bucket, so it covers the refresh too.
	s.rebuild(ctx)

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-refresh.C:
			s.refresh(ctx)
		case <-rebuild.C:
			s.rebuild(ctx)
		}
	}
}

func (s *Service) refresh(ctx context.Context) {
	// Back to the start of the hour Lookback ago, so a bucket is never half read.
	since := time.Now().Add(-s.cfg.Lookback).Truncate(time.Hour)
	if _, err := s.repo.RefreshNetworkPeaks(ctx, &since); err != nil && ctx.Err() == nil {
		s.log.Error("Network peak refresh failed", "err", err)
	}
}

func (s *Service) rebuild(ctx context.Context) {
	start := time.Now()
	s.log.Info("Rebuilding network peaks from all history")
	changed, err := s.repo.RefreshNetworkPeaks(ctx, nil)
	if err != nil {
		if ctx.Err() == nil {
			s.log.Error("Network peak rebuild failed", "err", err, "took", time.Since(start))
		}
		return
	}
	s.log.Info("Rebuilt network peaks", "changed", changed, "took", time.Since(start))
}
