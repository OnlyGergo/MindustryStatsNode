import dgram from 'dgram';
import dns from 'dns/promises';
import {GameMode, ServerData} from '../../../common/models/serverData.js';
import {readString} from '../utils/buffer.js';
import {MINDUSTRY_TIMEOUT_MILLISECONDS} from '../const.js';
import {createLogger} from '../logger.js';
import {lookupCountryFromIPSync} from "../utils/countryLookup.js";

const failedServersCache = new Set<string>();
const logger = createLogger('Mindustry Service');

// Turns out this isn't needed, the synchronous lookups were enough
/*const CUSTOM_DNS_SERVERS: string[] = [];

const customResolver = CUSTOM_DNS_SERVERS.length > 0 ? new dns.Resolver() : null;
if (customResolver) {
  customResolver.setServers(CUSTOM_DNS_SERVERS);
}*/

/**
 * Resolves a hostname to an IPv4 address sequentially.
 * Supports custom DNS name servers if configured.
 */
async function resolveHost(host: string): Promise<string> {
  // Direct return if the host is already a valid IPv4 address
  if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(host)) {
    return host;
  }

  try {
    // Try custom resolver if specified, otherwise fall back to system DNS
    /*if (customResolver) {
      const addresses = await customResolver.resolve4(host);
      if (addresses.length > 0) return addresses[0];
    }*/

    const lookupResult = await dns.lookup(host, { family: 4 });
    return lookupResult.address;
  } catch (err) {
    throw new Error(`DNS lookup failed for ${host}: ${(err as Error).message}`);
  }
}

/**
 * Pings a Mindustry server to fetch status, map, and player metrics.
 */
export async function getServerData(host: string, port: number | string, serverKey: string): Promise<ServerData | null> {
  const numericPort = typeof port === 'string' ? parseInt(port, 10) : port;

  if (isNaN(numericPort) || numericPort < 0 || numericPort > 65535) {
    logger.error(`Invalid port provided for ${host}: ${port}`);
    return null;
  }

  // 1. Core DNS Resolution Step
  let ipAddress: string;
  try {
    ipAddress = await resolveHost(host);
  } catch (err) {
    logger.warn((err as Error).message);
    return null;
  }

  // 2. Network Query Step
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const pingTime = Date.now();

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, MINDUSTRY_TIMEOUT_MILLISECONDS);

    const cleanup = () => {
      clearTimeout(timeout);
      try { socket.close(); } catch {}
    };

    socket.on('error', (err) => {
      cleanup();
      if (!failedServersCache.has(serverKey)) {
        logger.warn(`Socket error for ${serverKey}: ${err.message}`);
        failedServersCache.add(serverKey);
      }
      resolve(null); // Resolve null rather than rejecting to prevent upstream app crashes
    });

    socket.on('message', (message) => {
      cleanup();
      try {
        const buffer = Buffer.from(message);
        const offset = { value: 0 };

        // Parse Mindustry protocol payload
        const serverName = readString(buffer, offset);
        const mapName = readString(buffer, offset);

        const players = buffer.readInt32BE(offset.value); offset.value += 4;
        const wave = buffer.readInt32BE(offset.value); offset.value += 4;
        const version = buffer.readInt32BE(offset.value); offset.value += 4;

        const versionType = readString(buffer, offset);

        const gameModeIdx = buffer[offset.value] & 0xFF; offset.value += 1;
        const mode = gameModeIdx < Object.keys(GameMode).length / 2 ? (gameModeIdx as GameMode) : GameMode.SURVIVAL;

        const playerLimit = buffer.readInt32BE(offset.value); offset.value += 4;
        const description = readString(buffer, offset);
        const modeName = readString(buffer, offset);

        failedServersCache.delete(serverKey);

        resolve({
          ping: Date.now() - pingTime,
          host,
          port: numericPort,
          serverName,
          mapName,
          players,
          wave,
          version,
          versionType,
          mode,
          playerLimit,
          description,
          modeName,
          online: true,
          countryCode: lookupCountryFromIPSync(ipAddress)
        });
      } catch (err) {
        logger.error(`Failed to parse packet from ${serverKey}: ${(err as Error).message}`);
        resolve(null);
      }
    });

    const packet = Buffer.from([0xFE, 0x01]);

    socket.send(packet, numericPort, ipAddress, (err) => {
      if (err) {
        cleanup();
        resolve(null);
      }
    });
  });
}