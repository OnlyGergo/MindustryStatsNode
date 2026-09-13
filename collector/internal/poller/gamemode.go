package poller

// Port of backend/src/utils/GamemodeDecoder.ts.
//
// Source: https://github.com/Anuken/Mindustry/blob/master/core/src/mindustry/game/Gamemode.java#L9
// It is an enum, but we don't need that.
var gamemodes = []string{
	"Survival",
	"Sandbox",
	"Attack",
	"PvP",
	"Editor",
}

// GameMode is common/models/serverData.ts's GameMode enum.
type GameMode int

const (
	GameModeSurvival GameMode = iota
	GameModeSandbox
	GameModeAttack
	GameModePvP
	GameModeEditor
)

// gameModeCount is `Object.keys(GameMode).length / 2` -- the number of members
// in the TS numeric enum, which is what the packet's mode byte is bounded by.
const gameModeCount = 5

// DecodeGamemode returns the server's own mode name when it sent one, and the
// vanilla name for the mode ordinal otherwise.  An out-of-range ordinal yields
// "", matching `GAMEMODES[gamemodeInt]` evaluating to undefined -- the caller
// stores that as NULL.
func DecodeGamemode(gamemodeName string, gamemodeInt int) string {
	if len(gamemodeName) > 0 {
		return gamemodeName
	}
	if gamemodeInt < 0 || gamemodeInt >= len(gamemodes) {
		return ""
	}
	return gamemodes[gamemodeInt]
}
