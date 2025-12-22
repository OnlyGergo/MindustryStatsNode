import ip3country from 'ip3country';
import dns from 'dns';
import { createLogger } from '../logger.js';

const logger = createLogger('CountryLookup');

let initialized = false;

/**
 * Initialize the ip3country database
 */
export function initCountryLookup(): void {
    if (!initialized) {
        ip3country.init();
        initialized = true;
        logger.info('Country lookup initialized');
    }
}

/**
 * Resolve a hostname to an IP address
 */
async function resolveHostname(hostname: string): Promise<string | null> {
    return new Promise((resolve) => {
        // Check if it's already an IP address (IPv4)
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (ipv4Regex.test(hostname)) {
            resolve(hostname);
            return;
        }

        dns.lookup(hostname, { family: 4 }, (err, address) => {
            if (err) {
                logger.debug(`Failed to resolve hostname ${hostname}: ${err.message}`);
                resolve(null);
            } else {
                resolve(address);
            }
        });
    });
}

/**
 * Look up the country code for an IP address or hostname
 * Returns a 2-letter country code (e.g., 'US', 'DE', 'GB') or null if not found
 */
export async function lookupCountry(hostOrIp: string): Promise<string | null> {
    try {
        if (!initialized) {
            initCountryLookup();
        }

        // Resolve hostname to IP if needed
        const ip = await resolveHostname(hostOrIp);
        if (!ip) {
            return null;
        }

        const countryCode = ip3country.lookupStr(ip);
        return countryCode || null;
    } catch (error) {
        logger.warn(`Error looking up country for ${hostOrIp}:`, error);
        return null;
    }
}

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
