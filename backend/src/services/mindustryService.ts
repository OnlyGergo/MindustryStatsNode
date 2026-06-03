import dgram from 'dgram';
import dns from 'dns/promises';
import { GameMode, ServerData } from '../../../common/models/serverData.js';
import { readString } from '../utils/buffer.js';
import { MINDUSTRY_TIMEOUT_MILLISECONDS } from '../const.js';
import { createLogger } from '../logger.js';

const failedServersCache = new Set<string>();
const logger = createLogger('Mindustry Service');

export async function getServerData(host: string, port: number | string): Promise<ServerData | null> {
  const numericPort = typeof port === 'string' ? parseInt(port, 10) : port;
  const serverKey = `${host}:${numericPort}`;

  if (isNaN(numericPort) || numericPort < 0 || numericPort > 65535) {
    logger.error(`Invalid port provided for ${host}: ${port}`);
    return null;
  }

  let ipAddress: string;
  // If host is an IP address, we can skip DNS lookup. This also allows us to handle IPv6 addresses if needed in the future.
  if (/(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}/.test(host)) {
    ipAddress = host;
  } else {
  try {
    // Explicitly resolve DNS to IPv4.
    // This prevents udp4 sockets from failing silently if Docker resolves an IPv6 address first.
    // It also allows you to add SRV record resolution logic here later if needed.
    const lookupResult = await dns.lookup(host, { family: 4 });
    ipAddress = lookupResult.address;
  } catch (err) {
    logger.error(`DNS lookup failed for ${host}: ${(err as Error).message}`);
    return null;
  }
  }

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const pingTime = Date.now();
    let timeout: NodeJS.Timeout;

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
      reject(err);
    });

    socket.on('message', (message) => {
      cleanup();
      try {
        const buffer = Buffer.from(message);
        const offset = { value: 0 };

        const serverName = readString(buffer, offset);
        const map = readString(buffer, offset);
        const players = buffer.readInt32BE(offset.value); offset.value += 4;
        const wave = buffer.readInt32BE(offset.value); offset.value += 4;
        const version = buffer.readInt32BE(offset.value); offset.value += 4;
        const versionType = readString(buffer, offset);

        const gameModeIdx = buffer[offset.value] & 0xFF; offset.value += 1;
        const gamemode = gameModeIdx < Object.keys(GameMode).length / 2 ? gameModeIdx as GameMode : GameMode.SURVIVAL;
        const playerLimit = buffer.readInt32BE(offset.value); offset.value += 4;

        const description = readString(buffer, offset);
        const modeName = readString(buffer, offset);

        failedServersCache.delete(serverKey);

        resolve({
          ping: Date.now() - pingTime,
          host,
          port: numericPort,
          serverName,
          mapName: map,
          players,
          wave,
          version,
          versionType,
          mode: gamemode,
          playerLimit,
          description,
          modeName,
          online: true
        });
      } catch (err) {
        reject(err);
      }
    });

    timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, MINDUSTRY_TIMEOUT_MILLISECONDS);

    const packet = Buffer.from([0xFE, 0x01]);

    // 1. Connect the socket FIRST. This registers the 5-tuple in Docker's NAT/conntrack
    //    and passes stringent checks in firewalls like CrowdSec.
    // NOTE: The signature is connect(port, address, callback)
    socket.connect(numericPort, ipAddress, () => {
      // 2. Send the packet. Because the socket is now connected,
      //    we omit the port and address arguments here.
      socket.send(packet, (err) => {
        if (err) {
          cleanup();
          reject(err);
        }
      });
    });
  });
}