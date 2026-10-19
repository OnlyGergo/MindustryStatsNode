import { describe, expect, test } from 'bun:test';
import { mergeCustomisation } from './customisationMerge.js';

const net = { accentColor: '#112233', backgroundUrl: '/uploads/n' };

describe('mergeCustomisation', () => {
  test('server value wins per field', () => {
    expect(mergeCustomisation({ accentColor: '#aabbcc', backgroundUrl: null }, net))
      .toEqual({ accentColor: '#aabbcc', backgroundUrl: '/uploads/n' });
  });
  test('nulls fall through to the network', () => {
    expect(mergeCustomisation({ accentColor: null, backgroundUrl: null }, net)).toEqual(net);
    expect(mergeCustomisation(null, net)).toEqual(net);
  });
  test('nothing set anywhere gives nulls', () => {
    expect(mergeCustomisation(null, null)).toEqual({ accentColor: null, backgroundUrl: null });
  });
  test('server only', () => {
    expect(mergeCustomisation({ accentColor: '#000000', backgroundUrl: '/uploads/s' }, null))
      .toEqual({ accentColor: '#000000', backgroundUrl: '/uploads/s' });
  });
});
