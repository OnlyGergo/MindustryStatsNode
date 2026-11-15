import { describe, expect, test } from 'bun:test';
import { hubKeywordPattern, matchesHubKeyword } from '../../../common/hubKeywords.js';

describe('hub keywords', () => {
    test('matches whole words case-insensitively', () => {
        expect(matchesHubKeyword('Main Hub')).toBe(true);
        expect(matchesHubKeyword('LOBBY | play here')).toBe(true);
        expect(matchesHubKeyword('[accent]Hub[white] #1')).toBe(true);
    });

    test('ignores keywords inside other words', () => {
        expect(matchesHubKeyword('GitHub mirror')).toBe(false);
        expect(matchesHubKeyword('Lobbyist PvP')).toBe(false);
        expect(matchesHubKeyword(null)).toBe(false);
    });

    test('colour tags cannot hide or fake a keyword', () => {
        expect(matchesHubKeyword('[hub]Survival')).toBe(false);
        expect(matchesHubKeyword('H[red]ub')).toBe(true);
    });

    test('SQL pattern uses Postgres word boundaries', () => {
        expect(hubKeywordPattern()).toBe('\\y(hub|lobby)\\y');
    });
});
