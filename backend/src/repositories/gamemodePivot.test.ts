import { describe, expect, test } from 'bun:test';
import { pivotGamemodeHistory } from './gamemodePivot.js';

describe('pivotGamemodeHistory', () => {
  test('pivots ordered rows into one column per mode, keeping gaps as null', () => {
    const out = pivotGamemodeHistory([
      { timestamp: '1000', clean_name: 'Survival', players: '12' },
      { timestamp: '1000', clean_name: 'PvP', players: null },
      { timestamp: '2000', clean_name: 'Survival', players: 7 },
      { timestamp: '2000', clean_name: 'PvP', players: 3 },
    ]);

    expect(out).toEqual({
      timestamps: [1000, 2000],
      modes: ['Survival', 'PvP'],
      players: [[12, 7], [null, 3]],
    });
  });

  test('fills a mode missing from a bucket with null and names an empty mode Unknown', () => {
    const out = pivotGamemodeHistory([
      { timestamp: 1000, clean_name: '', players: 1 },
      { timestamp: 2000, clean_name: 'Attack', players: 4 },
    ]);

    expect(out.modes).toEqual(['Unknown', 'Attack']);
    expect(out.players).toEqual([[1, null], [null, 4]]);
  });

  test('handles no rows', () => {
    expect(pivotGamemodeHistory([])).toEqual({ timestamps: [], modes: [], players: [] });
  });
});
