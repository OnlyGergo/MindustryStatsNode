package processor

import (
	"testing"
	"time"

	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/collector"
	"github.com/OnlyGergo/MindustryStatsNode/collector/internal/poller"
)

func online(serverID int, at time.Time, mutate func(*poller.ServerData)) collector.RawServerData {
	data := &poller.ServerData{
		Host:        "h",
		Port:        6567,
		ServerName:  "Server",
		MapName:     "Ground Zero",
		Players:     4,
		Wave:        10,
		Version:     146,
		VersionType: "official",
		Mode:        poller.GameModeSurvival,
		PlayerLimit: 30,
		Description: "desc",
		ModeName:    "Survival",
		Online:      true,
		Ping:        25,
	}
	if mutate != nil {
		mutate(data)
	}
	return collector.RawServerData{
		Host:      data.Host,
		Port:      data.Port,
		Data:      data,
		Timestamp: at,
		Online:    true,
		ServerID:  serverID,
	}
}

func offline(serverID int, at time.Time) collector.RawServerData {
	return collector.RawServerData{Host: "h", Port: 6567, Timestamp: at, ServerID: serverID}
}

func TestBuildBatchOnlineSample(t *testing.T) {
	at := time.UnixMilli(1_700_000_000_000)

	b := buildBatch([]collector.RawServerData{online(1, at, nil)})

	if len(b.stats) != 1 {
		t.Fatalf("stats = %d rows, want 1", len(b.stats))
	}
	stat := b.stats[0]
	if stat.ServerID != 1 || !stat.Online || !stat.Timestamp.Equal(at) {
		t.Errorf("stat = %+v", stat)
	}
	if *stat.Players != 4 || *stat.MaxPlayers != 30 || *stat.Wave != 10 || *stat.Version != 146 || *stat.Ping != 25 {
		t.Errorf("stat numbers = %+v", stat)
	}
	if *stat.VersionType != "official" {
		t.Errorf("VersionType = %q", *stat.VersionType)
	}
	if len(b.onlineServerIDs) != 1 || b.onlineServerIDs[0] != 1 {
		t.Errorf("onlineServerIDs = %v, want [1]", b.onlineServerIDs)
	}
	if len(b.motds) != 1 || b.motds[0].ServerName != "Server" || b.motds[0].Description != "desc" {
		t.Errorf("motds = %+v", b.motds)
	}
	if len(b.maps) != 1 || b.maps[0].MapName != "Ground Zero" || b.maps[0].ModeName != "Survival" {
		t.Errorf("maps = %+v", b.maps)
	}
}

func TestBuildBatchOfflineSampleKeepsOnlyPlayersZero(t *testing.T) {
	at := time.UnixMilli(1_700_000_000_000)

	b := buildBatch([]collector.RawServerData{offline(9, at)})

	if len(b.stats) != 1 {
		t.Fatalf("stats = %d rows, want 1", len(b.stats))
	}
	stat := b.stats[0]
	if stat.Online {
		t.Error("an offline sample must be written with online = false")
	}
	// server_stats.players defaults to 0; every other column stays NULL, which
	// is the row Sequelize's DEFAULT-filled insert produced.
	if stat.Players == nil || *stat.Players != 0 {
		t.Errorf("Players = %v, want 0", stat.Players)
	}
	if stat.MaxPlayers != nil || stat.Wave != nil || stat.Version != nil || stat.VersionType != nil || stat.Ping != nil {
		t.Errorf("offline stat should leave the rest NULL: %+v", stat)
	}

	// An offline server has no MOTD or map to rotate, and did not answer, so it
	// is not in the last-seen update either.
	if len(b.motds) != 0 || len(b.maps) != 0 || len(b.onlineServerIDs) != 0 {
		t.Errorf("offline sample produced motds=%d maps=%d online=%d", len(b.motds), len(b.maps), len(b.onlineServerIDs))
	}
}

func TestBuildBatchKeepsOneEntryPerServerNewestWins(t *testing.T) {
	base := time.UnixMilli(1_700_000_000_000)

	// Out of order on purpose: the collector's workers finish in any order.
	b := buildBatch([]collector.RawServerData{
		online(1, base.Add(2*time.Second), func(d *poller.ServerData) { d.MapName = "newest" }),
		online(1, base, func(d *poller.ServerData) { d.MapName = "oldest" }),
		online(2, base.Add(time.Second), nil),
	})

	// Stats are a time series: every sample is kept.
	if len(b.stats) != 3 {
		t.Fatalf("stats = %d rows, want 3 (a sample per poll)", len(b.stats))
	}
	// The history tables hold one open row per server, so exactly one entry each.
	if len(b.maps) != 2 {
		t.Fatalf("maps = %d entries, want one per server", len(b.maps))
	}
	if b.maps[0].ServerID != 1 || b.maps[0].MapName != "newest" {
		t.Errorf("map entry for server 1 = %+v, want the newest sample", b.maps[0])
	}
	if len(b.motds) != 2 {
		t.Errorf("motds = %d entries, want one per server", len(b.motds))
	}
}

func TestBuildBatchSortsAscendingByTimestamp(t *testing.T) {
	base := time.UnixMilli(1_700_000_000_000)

	b := buildBatch([]collector.RawServerData{
		online(1, base.Add(3*time.Second), nil),
		online(2, base, nil),
		online(3, base.Add(time.Second), nil),
	})

	for i := 1; i < len(b.stats); i++ {
		if b.stats[i].Timestamp.Before(b.stats[i-1].Timestamp) {
			t.Fatalf("stats are not in ascending timestamp order: %v", b.stats)
		}
	}
}

func TestBuildBatchCollectsCountryCodes(t *testing.T) {
	base := time.UnixMilli(1_700_000_000_000)

	b := buildBatch([]collector.RawServerData{
		online(1, base, func(d *poller.ServerData) { d.CountryCode = "DE" }),
		online(2, base, nil), // no lookup result: nothing to write
		online(1, base.Add(time.Second), func(d *poller.ServerData) { d.CountryCode = "US" }),
	})

	if len(b.countries) != 1 {
		t.Fatalf("countries = %+v, want one entry", b.countries)
	}
	if b.countries[0].ServerID != 1 || b.countries[0].CountryCode != "US" {
		t.Errorf("country entry = %+v, want server 1 at its newest code", b.countries[0])
	}
}

func TestBuildBatchTreatsNilDataAsOffline(t *testing.T) {
	at := time.UnixMilli(1_700_000_000_000)

	// online = true but no payload: a bug upstream must not panic the writer.
	raw := collector.RawServerData{ServerID: 5, Timestamp: at, Online: true}

	b := buildBatch([]collector.RawServerData{raw})
	if len(b.stats) != 1 || b.stats[0].Online {
		t.Errorf("stats = %+v, want a single offline row", b.stats)
	}
}

func TestPopAllDrainsWithoutBlocking(t *testing.T) {
	ch := make(chan collector.RawServerData, 8)
	p := &Processor{in: ch}

	if got := p.popAll(); got != nil {
		t.Errorf("popAll() on an empty queue = %v, want nil", got)
	}

	at := time.UnixMilli(1_700_000_000_000)
	ch <- offline(1, at)
	ch <- offline(2, at)

	got := p.popAll()
	if len(got) != 2 {
		t.Fatalf("popAll() = %d items, want 2", len(got))
	}
	if got := p.popAll(); len(got) != 0 {
		t.Errorf("popAll() after draining = %d items, want 0", len(got))
	}
}

func TestSummariseIDs(t *testing.T) {
	if got := summariseIDs([]int{1, 2, 3}, 20); got != "1, 2, 3" {
		t.Errorf("summariseIDs() = %q", got)
	}
	if got := summariseIDs([]int{1, 2, 3}, 2); got != "1, 2 (+1 more)" {
		t.Errorf("summariseIDs() = %q", got)
	}
}
