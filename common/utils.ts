/**
 * Shared utility functions used by both backend and frontend
 */

/**
 * Convert a 2-letter country code to a flag emoji
 */
export function countryCodeToFlag(countryCode: string | null | undefined): string {
    if (!countryCode || countryCode.length !== 2) {
        return '🌐'; // Globe emoji for unknown
    }

    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}
