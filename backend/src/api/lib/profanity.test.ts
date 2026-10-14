import { describe, expect, test } from 'bun:test';
import { containsProfanity } from '../../../../common/profanity.js';

describe('containsProfanity', () => {
  test('clean text and empty input pass', () => {
    expect(containsProfanity('')).toBe(false);
    expect(containsProfanity('Great server, friendly admins and no lag.')).toBe(false);
  });

  test('whole-word matching avoids the Scunthorpe problem', () => {
    expect(containsProfanity('I live near Scunthorpe')).toBe(false);
    expect(containsProfanity('the assassin class has a classic passive')).toBe(false);
    expect(containsProfanity('Cockpit and peacock maps')).toBe(false);
  });

  test('matches whole words, case-insensitively, plus a trailing s', () => {
    expect(containsProfanity('this is SHIT')).toBe(true);
    expect(containsProfanity('the admins are bastards')).toBe(true);
    expect(containsProfanity('what the fuck.')).toBe(true);
  });

  test('folds leetspeak and diacritics', () => {
    expect(containsProfanity('sh1t')).toBe(true);
    expect(containsProfanity('$hit')).toBe(true);
    expect(containsProfanity('@sshole')).toBe(true);
    expect(containsProfanity('fück')).toBe(true);
  });

  test('matches multi-word phrases only as a whole', () => {
    expect(containsProfanity('a blue waffle')).toBe(true);
    expect(containsProfanity('blue team won, waffle maps next')).toBe(false);
  });

  test('entries with digits fold the same way as the input', () => {
    expect(containsProfanity('2g1c')).toBe(true);
  });

  test('symbol-only entries match as substrings', () => {
    expect(containsProfanity('ok🖕')).toBe(true);
  });

  test('negative feedback and game terms are allowed', () => {
    expect(containsProfanity('this server sucks, admins suck')).toBe(false);
    expect(containsProfanity('hardcore domination mode, escort the payload')).toBe(false);
  });
});
