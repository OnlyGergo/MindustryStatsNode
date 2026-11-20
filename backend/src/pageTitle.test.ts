import { describe, expect, test } from 'bun:test';
import { docTitle, plainTitle } from '../../frontend/src/util/pageTitle.ts';

describe('docTitle', () => {
  test('drops Mindustry private-use glyphs and collapses the gap they leave', () => {
    expect(docTitle('\uE86D XCore \uF7A9 > Mini PvP')).toBe('XCore > Mini PvP · Mindustry Tracker');
  });

  test('keeps ordinary Unicode, CJK and emoji', () => {
    expect(plainTitle('幽柠之域 | 大厅 ⚙ 🎮')).toBe('幽柠之域 | 大厅 ⚙ 🎮');
  });

  test('a name made only of glyphs falls back to the site name', () => {
    expect(docTitle('\uE800\uE801 ')).toBe('Mindustry Tracker');
  });

  test('strips control and zero-width characters, but keeps emoji joiners', () => {
    expect(plainTitle('👨\u200D👩')).toBe('👨\u200D👩');
    expect(plainTitle('a\u200Bb\u0007c')).toBe('ab c');
  });
});
