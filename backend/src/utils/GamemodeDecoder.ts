// Source: https://github.com/Anuken/Mindustry/blob/master/core/src/mindustry/game/Gamemode.java#L9
// Its an enum, but we don't need that
const GAMEMODES = [ // todo maybe add a registry for this and relate to history - deduplicate this too
    "Survival",
    "Sandbox",
    "Attack",
    "PvP",
    "Editor",
]

export function decodeGamemode(gamemodeName: string, gamemodeInt: number) {
    if (gamemodeName != null && gamemodeName.length > 0) {
        return gamemodeName;
    }
    return GAMEMODES[gamemodeInt];
}