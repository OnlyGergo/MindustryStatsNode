package repository

import (
	"strings"
	"testing"
	"time"
)

func TestNormalize(t *testing.T) {
	tests := []struct {
		name string
		in   any
		want string
	}{
		{"nil is the empty key part", nil, ""},
		{"empty string", "", ""},
		{"string", "Serpulo", "Serpulo"},
		{"int", 3, "3"},
		{"smallint from the driver", int16(3), "3"},
		{"int32 from the driver", int32(3), "3"},
		{"zero is not empty", 0, "0"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalize(tc.in); got != tc.want {
				t.Errorf("normalize(%#v) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestNormalizeAgreesAcrossIntegerWidths(t *testing.T) {
	// The outgoing row holds a Go int; the read-back row holds whatever pgx
	// decoded a smallint into.  If these disagreed, every map registry lookup
	// would miss and history would rotate on every poll.
	if normalize(3) != normalize(int16(3)) {
		t.Errorf("normalize(int) = %q but normalize(int16) = %q", normalize(3), normalize(int16(3)))
	}
}

func TestRegistryKeySeparatesColumns(t *testing.T) {
	columns := []string{"server_name", "description"}

	// '|' is a staple of server names: a printable separator would let these two
	// different rows collapse onto one key, handing one server another's MOTD.
	a := registryKey(map[string]any{"server_name": "a|b", "description": "c"}, columns)
	b := registryKey(map[string]any{"server_name": "a", "description": "b|c"}, columns)
	if a == b {
		t.Errorf("registryKey collapsed two different rows onto %q", a)
	}
	if !strings.Contains(a, "\x00") {
		t.Errorf("registryKey(%q) does not use the NUL separator", a)
	}
}

func TestRegistryKeyTreatsNilAndEmptyAlike(t *testing.T) {
	columns := []string{"map_name", "game_mode", "mode_name"}

	withNil := registryKey(map[string]any{"map_name": "Ground Zero", "game_mode": 0, "mode_name": nil}, columns)
	withEmpty := registryKey(map[string]any{"map_name": "Ground Zero", "game_mode": int16(0), "mode_name": ""}, columns)
	if withNil != withEmpty {
		t.Errorf("registryKey: nil mode_name = %q but empty = %q", withNil, withEmpty)
	}
}

func TestDescribeRegistryKey(t *testing.T) {
	got := describeRegistryKey(map[string]any{"server_name": "S", "description": ""}, []string{"server_name", "description"})
	if got != `server_name="S", description=""` {
		t.Errorf("describeRegistryKey() = %s", got)
	}
	if describeRegistryKey(nil, []string{"a"}) != "<unknown>" {
		t.Error("describeRegistryKey(nil) should render as <unknown>")
	}
}

func TestDedupeStatsByPrimaryKey(t *testing.T) {
	base := time.UnixMilli(1_700_000_000_000)

	batch := []StatRow{
		{ServerID: 1, Timestamp: base, Players: int32p(1)},
		{ServerID: 1, Timestamp: base, Players: int32p(2)}, // same PK: same observation
		{ServerID: 2, Timestamp: base, Players: int32p(3)},
		{ServerID: 1, Timestamp: base.Add(time.Second), Players: int32p(4)},
	}

	rows := dedupeStatsByPrimaryKey(batch)
	if len(rows) != 3 {
		t.Fatalf("dedupeStatsByPrimaryKey() kept %d rows, want 3", len(rows))
	}
	// First occurrence wins, as the TS Set-based dedupe did.
	if *rows[0].Players != 1 {
		t.Errorf("kept players = %d, want the first sample (1)", *rows[0].Players)
	}
}

func TestDedupeStatsIsMillisecondGranular(t *testing.T) {
	// server_stats' primary key is (server_id, timestamp) and the collector
	// stamps milliseconds; two samples inside one millisecond are one row.
	base := time.UnixMilli(1_700_000_000_000)

	rows := dedupeStatsByPrimaryKey([]StatRow{
		{ServerID: 1, Timestamp: base},
		{ServerID: 1, Timestamp: base.Add(500 * time.Microsecond)},
	})
	if len(rows) != 1 {
		t.Fatalf("dedupeStatsByPrimaryKey() kept %d rows, want 1", len(rows))
	}
}

func TestDedupeByServerKeepsNewestAtFirstPosition(t *testing.T) {
	entries := []HistoryEntry{
		{ServerID: 1, Row: map[string]any{"map_name": "first"}},
		{ServerID: 2, Row: map[string]any{"map_name": "other"}},
		{ServerID: 1, Row: map[string]any{"map_name": "newest"}},
	}

	got := dedupeByServer(entries)
	if len(got) != 2 {
		t.Fatalf("dedupeByServer() kept %d entries, want 2", len(got))
	}
	if got[0].ServerID != 1 || got[0].Row["map_name"] != "newest" {
		t.Errorf("entry 0 = %+v, want server 1 holding the newest value", got[0])
	}
	if got[1].ServerID != 2 {
		t.Errorf("entry 1 = %+v, want server 2 to keep its position", got[1])
	}
}

func TestToJSONUsesColumnNames(t *testing.T) {
	// The payload feeds jsonb_to_recordset, so the field names have to be the
	// column names exactly.
	payload, err := toJSON([]StatRow{{
		ServerID:  7,
		Timestamp: time.UnixMilli(1_700_000_000_000).UTC(),
		Players:   int32p(5),
		Online:    true,
	}})
	if err != nil {
		t.Fatalf("toJSON() error = %v", err)
	}

	for _, column := range []string{
		"server_id", "timestamp", "players", "max_players", "wave",
		"version", "version_type", "ping", "online", "motd_registry_id", "map_registry_id",
	} {
		if !strings.Contains(payload, `"`+column+`"`) {
			t.Errorf("toJSON() payload is missing column %q: %s", column, payload)
		}
	}
	if !strings.Contains(payload, `"max_players":null`) {
		t.Errorf("an absent nullable column should serialise as null: %s", payload)
	}
}

func TestGamemodeKeyDistinguishesPairs(t *testing.T) {
	if gamemodeKey(0, "1") == gamemodeKey(1, "") {
		t.Error("gamemodeKey collapsed (0, \"1\") onto (1, \"\")")
	}
}

func TestCondense(t *testing.T) {
	got := condense("SELECT\n\t1,\n\t2\nFROM t")
	if got != "SELECT 1, 2 FROM t" {
		t.Errorf("condense() = %q", got)
	}
	if len(condense(strings.Repeat("x", maxSQLLength*2))) != maxSQLLength+3 {
		t.Error("condense() should truncate a long statement")
	}
}

func int32p(v int32) *int32 { return &v }
