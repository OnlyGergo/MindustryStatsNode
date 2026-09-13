package collector

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/repository"
)

func TestTaskQueueIsFIFO(t *testing.T) {
	q := newTaskQueue()
	for i := 1; i <= 3; i++ {
		q.push(repository.ServerRecord{ID: i})
	}

	for i := 1; i <= 3; i++ {
		item, ok := q.pop(context.Background())
		if !ok {
			t.Fatalf("pop() %d: queue closed early", i)
		}
		if item.ID != i {
			t.Errorf("pop() = %d, want %d", item.ID, i)
		}
		q.done()
	}
}

func TestTaskQueueStats(t *testing.T) {
	q := newTaskQueue()
	q.push(repository.ServerRecord{ID: 1})
	q.push(repository.ServerRecord{ID: 2})

	if size, pending := q.stats(); size != 2 || pending != 0 {
		t.Fatalf("stats() = (%d, %d), want (2, 0)", size, pending)
	}

	q.pop(context.Background())
	if size, pending := q.stats(); size != 1 || pending != 1 {
		t.Fatalf("stats() after one pop = (%d, %d), want (1, 1)", size, pending)
	}

	q.done()
	if _, pending := q.stats(); pending != 0 {
		t.Fatalf("stats() after done() = pending %d, want 0", pending)
	}
}

func TestTaskQueuePopUnblocksOnClose(t *testing.T) {
	q := newTaskQueue()

	done := make(chan bool, 1)
	go func() {
		_, ok := q.pop(context.Background())
		done <- ok
	}()

	time.Sleep(10 * time.Millisecond)
	q.close()

	select {
	case ok := <-done:
		if ok {
			t.Error("pop() returned an item from a closed empty queue")
		}
	case <-time.After(time.Second):
		t.Fatal("pop() did not return after close()")
	}
}

func TestTaskQueuePopUnblocksOnContextCancel(t *testing.T) {
	q := newTaskQueue()
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		defer close(done)
		q.pop(ctx)
	}()

	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("pop() did not return after the context was cancelled")
	}
}

func TestTaskQueueIsConcurrencySafe(t *testing.T) {
	q := newTaskQueue()
	const items = 500

	var wg sync.WaitGroup
	for w := 0; w < 4; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				if _, ok := q.pop(context.Background()); !ok {
					return
				}
				q.done()
			}
		}()
	}

	for i := 0; i < items; i++ {
		q.push(repository.ServerRecord{ID: i})
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if size, pending := q.stats(); size == 0 && pending == 0 {
			break
		}
		time.Sleep(time.Millisecond)
	}

	q.close()
	wg.Wait()

	if size, pending := q.stats(); size != 0 || pending != 0 {
		t.Errorf("stats() = (%d, %d), want the queue fully drained", size, pending)
	}
}

func TestIntervalLimiterCapsStartsPerWindow(t *testing.T) {
	// p-queue's intervalCap: only `cap` tasks may start within one window.
	l := newIntervalLimiter(3, time.Hour)

	for i := 0; i < 3; i++ {
		if err := l.acquire(context.Background()); err != nil {
			t.Fatalf("acquire() %d: %v", i, err)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if err := l.acquire(ctx); err == nil {
		t.Error("acquire() past the interval cap should block until the next refill")
	}
}

func TestIntervalLimiterRefills(t *testing.T) {
	l := newIntervalLimiter(1, 20*time.Millisecond)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go l.run(ctx)

	for i := 0; i < 3; i++ {
		acquireCtx, acquireCancel := context.WithTimeout(context.Background(), time.Second)
		if err := l.acquire(acquireCtx); err != nil {
			acquireCancel()
			t.Fatalf("acquire() %d: %v", i, err)
		}
		acquireCancel()
	}
}

func TestIntervalLimiterDoesNotAccumulateTokens(t *testing.T) {
	l := newIntervalLimiter(2, time.Millisecond)

	ctx, cancel := context.WithCancel(context.Background())
	go l.run(ctx)
	time.Sleep(20 * time.Millisecond) // many refills, no consumers
	cancel()
	time.Sleep(20 * time.Millisecond) // let the shutdown refill land too

	drained := 0
	for {
		checkCtx, checkCancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
		err := l.acquire(checkCtx)
		checkCancel()
		if err != nil {
			break
		}
		drained++
		if drained > 2 {
			t.Fatalf("limiter handed out %d tokens, want at most its capacity of 2", drained)
		}
	}
}

func TestCacheKey(t *testing.T) {
	if got := CacheKey(42); got != "server:data:42" {
		t.Errorf("CacheKey(42) = %q, want %q", got, "server:data:42")
	}
}

func TestNowMillisHasNoSubMillisecondPart(t *testing.T) {
	// The timestamp is half of server_stats' primary key; sub-millisecond
	// precision would slip past the batch dedupe the TS writer relied on.
	if got := nowMillis(); got.UnixNano()%int64(time.Millisecond) != 0 {
		t.Errorf("nowMillis() = %v, want millisecond resolution", got)
	}
}
