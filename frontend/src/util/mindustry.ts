import {ServerWithHistory} from "../../../common/models/serverData.ts";

export function removeColors(text: string | null) {
    if (text === null) return null;
    return text.replace(/\[([a-zA-Z0-9#]*?)]/g, '');
}

export function getGameModeName(mode: number | null): string {
    return ['Survival', 'Sandbox', 'Attack', 'PvP', 'Editor'][mode || 0] || 'Unknown';
}

export function isHub(server: ServerWithHistory) {
        const nameLower = server.name?.toLowerCase() || '';
        const motdLower = server.currentData?.description?.toLowerCase() || '';
        const modeLower = server.currentData?.modeName?.toLowerCase() || '';
        const mapLower = server.currentData?.mapName?.toLowerCase() || '';

        return nameLower.includes('hub') || nameLower.includes('lobby') ||
               motdLower.includes('hub') || motdLower.includes('lobby') ||
               modeLower.includes('hub') || modeLower.includes('lobby') ||
               mapLower.includes('hub') || mapLower.includes('lobby');
    }