import {ServerElement} from "../../../common/models/serverData.ts";
import {removeColorsFromMindustry} from "../../../common/Mindustry.ts";

export function removeColors(text: string | null): string | null {
    if (text === null) return null;
    // Its used in like 50 place, IM NOT removing all
    return removeColorsFromMindustry(text);
}


/**
 * Formats text for unsafe HTML display by removing color codes and replacing newlines with <br/>.
 * Returns a sanitized string that can be safely used in innerHTML.
 * Also trims to a max of 500 characters to prevent excessive length.
 * @param text
 */
export function formatUnsafeText(text: string): string {
    if (text === null) return "";
    const cleanedText = removeColorsFromMindustry(text);
    if (cleanedText === null) return "";
    return String(cleanedText.replace(/\n/g, '<br/>').trim().substring(0, 500));
}

export function isHub(server: ServerElement) {
        const nameLower = server.name?.toLowerCase() || '';
        const motdLower = server.currentData?.description?.toLowerCase() || '';
        const modeLower = server.currentData?.modeName?.toLowerCase() || '';
        const mapLower = server.currentData?.mapName?.toLowerCase() || '';

        return nameLower.includes('hub') || nameLower.includes('lobby') ||
               motdLower.includes('hub') || motdLower.includes('lobby') ||
               modeLower.includes('hub') || modeLower.includes('lobby') ||
               mapLower.includes('hub') || mapLower.includes('lobby');
    }