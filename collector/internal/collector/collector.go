// Package collector polls every known server on a fixed cycle and hands the
// results to the processor.
//
// Port of backend/src/services/ServerCollectorService.ts.  p-queue's
// {concurrency, interval, intervalCap} becomes a fixed pool of workers reading
// one FIFO, gated by a token bucket refilled once per interval.
package collector

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/config"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/logging"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/poller"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/repository"
)

// RawServerData is one poll result, the payload of the queue between the
// collector and the processor.
type RawServerData struct {
	Host        string
	Port        int
	NetworkName string
	Data        *poller.ServerData
	// Timestamp is truncated to milliseconds: it is half of server_stats'
	// primary key, and the TS writer's Date.now() had exactly that resolution,
	// so the dedupe on (server_id, timestamp) has to see the same granularity.
	Timestamp time.Time
	Online    bool
	Err       string
	CacheKey  string
	ServerID  int
}

// CacheKey is CACHE_KEYS.SERVER_DATA from backend/src/shared/constants.ts.  It
// is only an identifier in logs now that there is no cache, but keeping the
// shape makes Go and TS log lines comparable during the cutover.
func CacheKey(serverID int) string {
	return fmt.Sprintf("server:data:%d", serverID)
}

type Collector struct {
	cfg    config.CollectorConfig
	repo   *repository.Repository
	poller *poller.Poller
	out    chan<- RawServerData
	log    *slog.Logger

	tasks   *taskQueue
	limiter *intervalLimiter
}

func New(cfg config.CollectorConfig, repo *repository.Repository, p *poller.Poller, out chan<- RawServerData) *Collector {
	return &Collector{
		cfg:     cfg,
		repo:    repo,
		poller:  p,
		out:     out,
		log:     logging.New("ServerCollector"),
		tasks:   newTaskQueue(),
		limiter: newIntervalLimiter(cfg.IntervalCap(), cfg.ServerCollectionInterval),
	}
}

// Run starts the worker pool and the collection cycle, returning once ctx is
// cancelled and every in-flight query has finished.
func (c *Collector) Run(ctx context.Context) error {
	c.log.Info("Starting Server Collector Service...")

	var workers sync.WaitGroup
	for i := 0; i < c.cfg.Concurrency; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			c.work(ctx)
		}()
	}

	limiterDone := make(chan struct{})
	go func() {
		defer close(limiterDone)
		c.limiter.run(ctx)
	}()

	c.log.Info("Server Collector Service started",
		"refresh_server_lists", c.cfg.DataCollectionInterval,
		"refresh_server_data", c.cfg.ServerCollectionInterval,
		"workers", c.cfg.Concurrency,
	)

	// Initial sweep, then one every DATA_COLLECTION_INTERVAL_MS.
	if err := c.CollectServers(ctx); err != nil {
		c.log.Error("Error in initial server collection", "err", err)
	} else {
		c.log.Info("Initial Server Collection Complete")
	}

	ticker := time.NewTicker(c.cfg.DataCollectionInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			c.tasks.close()
			workers.Wait()
			<-limiterDone
			c.log.Info("Server Collector Service stopped")
			return nil
		case <-ticker.C:
			// Unlike the TS setInterval, a cycle cannot overlap the previous
			// one's enqueue step; the queue itself still absorbs a sweep that
			// has not finished draining.
			if err := c.CollectServers(ctx); err != nil {
				c.log.Error("Error in scheduled server list refresh", "err", err)
			}
		}
	}
}

// CollectServers reads the server list fresh from the database and queues every
// server for a poll.
func (c *Collector) CollectServers(ctx context.Context) error {
	servers, err := c.repo.GetServers(ctx)
	if err != nil {
		return err
	}

	for _, server := range servers {
		if logging.Enabled(slog.LevelDebug) {
			c.log.Debug("Added server to collection queue", "server", server.ID, "name", server.Name)
		}
		c.tasks.push(server)
	}

	size, pending := c.tasks.stats()
	c.log.Info("Added servers to queue", "servers", len(servers), "queued", size, "in_flight", pending)
	return nil
}

// QueueStats is getQueueStats(): waiting tasks and in-flight tasks.
func (c *Collector) QueueStats() (size, pending int) { return c.tasks.stats() }

func (c *Collector) work(ctx context.Context) {
	for {
		server, ok := c.tasks.pop(ctx)
		if !ok {
			return
		}
		if err := c.limiter.acquire(ctx); err != nil {
			c.tasks.done()
			return
		}
		c.processServerDiscovery(ctx, server)
		c.tasks.done()
	}
}

// processServerDiscovery queries one server and pushes the result, online or
// not -- the offline sample is what keeps a server's uptime history honest.
func (c *Collector) processServerDiscovery(ctx context.Context, server repository.ServerRecord) {
	serverKey := CacheKey(server.ID)

	if logging.Enabled(slog.LevelDebug) {
		c.log.Debug("Querying server", "server", serverKey, "name", server.Name)
	}

	data, err := c.poller.Query(ctx, server.Host, server.Port, serverKey)

	raw := RawServerData{
		Host:        server.Host,
		Port:        server.Port,
		NetworkName: server.Name,
		Data:        data,
		Timestamp:   nowMillis(),
		Online:      data != nil,
		CacheKey:    serverKey,
		ServerID:    server.ID,
	}

	if err != nil {
		c.log.Warn("Error processing server", "server", serverKey, "name", server.Name, "err", err)
		raw.Data = nil
		raw.Online = false
		raw.Err = err.Error()
	}

	if logging.Enabled(slog.LevelDebug) {
		if raw.Online {
			c.log.Debug("Successfully queried server",
				"server", serverKey, "name", server.Name,
				"players", data.Players, "player_limit", data.PlayerLimit)
		} else {
			c.log.Debug("Server is offline or unreachable", "server", serverKey, "name", server.Name)
		}
	}

	select {
	case c.out <- raw:
	case <-ctx.Done():
	}
}

// nowMillis is Date.now(): millisecond resolution, which server_stats' primary
// key and the batch dedupe both depend on.
func nowMillis() time.Time {
	return time.UnixMilli(time.Now().UnixMilli())
}

// taskQueue is p-queue's unbounded task list: a FIFO the workers drain, which
// keeps accepting a new sweep while the previous one is still being polled.
type taskQueue struct {
	mu      sync.Mutex
	cond    *sync.Cond
	items   []repository.ServerRecord
	pending int
	closed  bool
}

func newTaskQueue() *taskQueue {
	q := &taskQueue{}
	q.cond = sync.NewCond(&q.mu)
	return q
}

func (q *taskQueue) push(item repository.ServerRecord) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return
	}
	q.items = append(q.items, item)
	q.cond.Signal()
}

// pop blocks until an item is available or the queue closes.
func (q *taskQueue) pop(ctx context.Context) (repository.ServerRecord, bool) {
	// A cancelled context has to wake the waiters, and sync.Cond cannot select.
	stop := context.AfterFunc(ctx, func() { q.close() })
	defer stop()

	q.mu.Lock()
	defer q.mu.Unlock()

	for len(q.items) == 0 && !q.closed {
		q.cond.Wait()
	}
	if len(q.items) == 0 {
		return repository.ServerRecord{}, false
	}

	item := q.items[0]
	q.items = q.items[1:]
	q.pending++
	return item, true
}

func (q *taskQueue) done() {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.pending > 0 {
		q.pending--
	}
}

func (q *taskQueue) close() {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.closed = true
	q.cond.Broadcast()
}

func (q *taskQueue) stats() (size, pending int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.items), q.pending
}

// intervalLimiter is p-queue's {interval, intervalCap}: at most cap tasks may
// start within any one interval window.
type intervalLimiter struct {
	tokens   chan struct{}
	cap      int
	interval time.Duration
}

func newIntervalLimiter(cap int, interval time.Duration) *intervalLimiter {
	l := &intervalLimiter{tokens: make(chan struct{}, cap), cap: cap, interval: interval}
	l.refill()
	return l
}

// run refills the bucket once per interval until ctx is cancelled.
func (l *intervalLimiter) run(ctx context.Context) {
	ticker := time.NewTicker(l.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			// Release the waiters so shutdown does not have to wait out a
			// whole interval.
			l.refill()
			return
		case <-ticker.C:
			l.refill()
		}
	}
}

// refill tops the bucket up; unused tokens do not carry over past its capacity,
// which is what makes it a per-interval cap rather than a running average.
func (l *intervalLimiter) refill() {
	for i := 0; i < l.cap; i++ {
		select {
		case l.tokens <- struct{}{}:
		default:
			return
		}
	}
}

func (l *intervalLimiter) acquire(ctx context.Context) error {
	select {
	case <-l.tokens:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
