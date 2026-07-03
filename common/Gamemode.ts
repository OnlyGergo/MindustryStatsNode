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

export function getVanillaModeName(mode_int: number): string {
    if (mode_int === null) return "Unknown";
    return ['Survival', 'Sandbox', 'Attack', 'PvP', 'Editor'][mode_int]
}

const modeMap: Record<string, number> = {
    "survival": 0,
    "sandbox": 1,
    "attack": 2,
    "pvp": 3,
    "editor": 4
}
export function modeNameToIntOrNull(mode_name: string | null): number | null {
    if (mode_name === null) return null;
    //todo native gamemodes and custom needs to be differentiated, for now this
    return modeMap[mode_name.toLowerCase()] ?? null;
}