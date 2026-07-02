import {removeColorsFromMindustry} from "./Mindustry.js";

export function getModeName(mode_name: string, mode_int: number): string {
    const colorlesss = removeColorsFromMindustry(mode_name);
    if (colorlesss) {
        return colorlesss;
    }

    if (mode_int === null) return "Unknown";
    return ['Survival', 'Sandbox', 'Attack', 'PvP', 'Editor'][mode_int || 0] || 'Unknown';
}