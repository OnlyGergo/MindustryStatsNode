// Pure row -> column pivot for the gamemode history chart. No DB/env import,
// so it can be unit tested on its own.
import { type GamemodeHistory } from '../../../common/models/GlobalStatsTypes.js';

export interface RawGamemodeHistoryRow {
    timestamp: number | string;
    clean_name: string;
    players: number | string | null;
}

/**
 * Pivots (bucket, mode) rows into columns. Rows must arrive ordered by bucket,
 * so timestamps come out sorted. clean_name is stored already stripped and
 * backed off to the vanilla name, so there is nothing left to clean here.
 */
export function pivotGamemodeHistory(rows: RawGamemodeHistoryRow[]): GamemodeHistory {
    const timestamps: number[] = [];
    const tsIndex = new Map<number, number>();
    const modeIndex = new Map<string, number>();
    for (const r of rows) {
        const ts = Number(r.timestamp);
        if (!tsIndex.has(ts)) tsIndex.set(ts, timestamps.push(ts) - 1);
        const mode = r.clean_name || 'Unknown';
        if (!modeIndex.has(mode)) modeIndex.set(mode, modeIndex.size);
    }

    const modes = [...modeIndex.keys()];
    const players = modes.map(() => new Array<number | null>(timestamps.length).fill(null));
    for (const r of rows) {
        if (r.players == null) continue;
        players[modeIndex.get(r.clean_name || 'Unknown')!]![tsIndex.get(Number(r.timestamp))!] = Number(r.players);
    }
    return { timestamps, modes, players };
}
