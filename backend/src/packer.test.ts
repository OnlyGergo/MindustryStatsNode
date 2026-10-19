import { describe, expect, test } from 'bun:test';
import { ApiPacker } from '../../common/Packer.js';

describe('ApiPacker', () => {
  test('round-trips objects', () => {
    const data = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
    expect(ApiPacker.unpack(ApiPacker.pack(data))).toEqual(data);
  });

  test('keeps a field the first object lacks', () => {
    // A server with no fresh stats has no currentData; if it sorts first, the
    // field must not vanish from every other row too.
    const packed = ApiPacker.pack<{ id: number; currentData?: { players: number } }>([
      { id: 1 },
      { id: 2, currentData: { players: 5 } },
    ]);
    const [first, second] = ApiPacker.unpack<any>(JSON.parse(JSON.stringify(packed)));
    expect(first.currentData ?? undefined).toBeUndefined();
    expect(second.currentData).toEqual({ players: 5 });
  });
});
