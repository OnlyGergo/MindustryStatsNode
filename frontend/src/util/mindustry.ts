import {removeColorsFromMindustry} from "../../../common/Mindustry.ts";

export function removeColors(text: string | null): string | null {
    if (text === null) return null;
    // Its used in like 50 place, IM NOT removing all
    return removeColorsFromMindustry(text);
}


/**
 * Splits server-supplied text into display lines with colour codes removed,
 * trimmed to a max of 500 characters to prevent excessive length.
 * The lines are plain text: render them as React children (joined with <br/>
 * elements), never through innerHTML, since the source is attacker-controlled.
 * @param text
 */
export function formatTextLines(text: string | null): string[] {
    if (text === null) return [];
    const cleanedText = removeColorsFromMindustry(text);
    if (cleanedText === null) return [];
    return cleanedText.trim().substring(0, 500).split('\n');
}

const modes = [' ', '', ' ', '', '']
export function modeIdToIcon(modeId: number): string {
    return modes[modeId] ?? '?';
}