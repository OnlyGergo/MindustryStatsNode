import {removeColorsFromMindustry} from "./Mindustry.js";

export function getModeName(mode_name: string | null, mode_int: number): string {
    if (mode_name !== null) {
        const colorlesss = removeColorsFromMindustry(mode_name);
        if (colorlesss) {
            return colorlesss;
        }
    }

    if (mode_int === null) return "Unknown";
    return ['Survival', 'Sandbox', 'Attack', 'PvP', 'Editor'][mode_int || 0] || 'Unknown';
}

const modeMap: Record<string, number> = {
    "Survival": 0,
    "Sandbox": 1,
    "Attack": 2,
    "PvP": 3,
    "Editor": 4
}
export function modeNameToIntOrNull(mode_name: string | null): number | null {
    if (mode_name === null) return null;
    //todo native gamemodes and custom needs to be differentiated, for now this
    return modeMap[mode_name] ?? null;
}