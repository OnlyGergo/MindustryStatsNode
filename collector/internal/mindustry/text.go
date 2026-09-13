// Package mindustry holds the little text rules the game's own data carries:
// colour markup and gamemode display names.  Ports of common/Mindustry.ts and
// common/Gamemode.ts, which the write path needs for gamemode_registry's
// clean_name column.
package mindustry

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// VanillaModes is Mindustry's Gamemode enum, in ordinal order.
// Source: https://github.com/Anuken/Mindustry/blob/master/core/src/mindustry/game/Gamemode.java
var VanillaModes = []string{"Survival", "Sandbox", "Attack", "PvP", "Editor"}

// Mindustry colour markup: "[accent]Name" / "[#ff0000]Name".
var colorTag = regexp.MustCompile(`\[([a-zA-Z0-9#]*?)]`)

// StripColors is removeColorsFromMindustry from common/Mindustry.ts.
func StripColors(text string) string {
	return colorTag.ReplaceAllString(text, "")
}

// VanillaModeName is getVanillaModeName: the enum's own name for a mode int.
func VanillaModeName(mode int) string {
	if mode < 0 || mode >= len(VanillaModes) {
		return "Unknown"
	}
	return VanillaModes[mode]
}

// CleanModeName is getModeName from common/Gamemode.ts: the server's own mode
// name with colour markup removed, falling back to the vanilla name for the
// mode int when the server did not send one.
//
// clean_name is derived here rather than in SQL so the display name stays
// defined in one place per process, mirroring the TS comment on
// resolveGamemodeIds.
func CleanModeName(modeName string, mode int) string {
	// Not trimmed: JS treats any non-empty string as truthy here, and migration
	// 24 seeded the historical rows with a SQL translation of that same rule.
	if colorless := StripColors(modeName); colorless != "" {
		return colorless
	}
	if mode < 0 || mode >= len(VanillaModes) {
		// getModeName's `[...][mode_int || 0] || 'Unknown'`.
		return "Unknown"
	}
	return VanillaModes[mode]
}

// SanitizeText makes a string from the wire safe to store.
//
// Node's Buffer.toString('utf8') substitutes U+FFFD for malformed sequences, so
// the TS path never handed Postgres invalid UTF-8; a raw Go []byte -> string
// conversion would, and Postgres rejects the whole batch over it.  NUL is
// dropped for the same reason: text columns cannot hold it, and it is the
// separator the registry key uses.
func SanitizeText(s string) string {
	if utf8.ValidString(s) && !strings.ContainsRune(s, 0) {
		return s
	}
	s = strings.ToValidUTF8(s, "�")
	return strings.ReplaceAll(s, "\x00", "")
}
