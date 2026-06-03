import dgram from 'dgram';
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

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const pingTime = Date.now();
    let timeout: NodeJS.Timeout;

    socket.on('error', (err) => {
      clearTimeout(timeout);
      try { socket.close(); } catch {}

      if (!failedServersCache.has(serverKey)) {
        logger.warn(`Socket error for ${serverKey}: ${err.message}`);
        failedServersCache.add(serverKey);
      }
      reject(err);
    });

    socket.on('message', (message) => {
      clearTimeout(timeout);
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

        socket.close();
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
        socket.close();
        reject(err);
      }
    });

    // Directly send to host/port, bypassing connect() validation
    const packet = Buffer.from([0xFE, 0x01]);
    timeout = setTimeout(() => {
      try { socket.close(); } catch {}
      resolve(null);
    }, MINDUSTRY_TIMEOUT_MILLISECONDS);

    socket.send(packet, numericPort, host, (err) => {
      if (err) {
        clearTimeout(timeout);
        try { socket.close(); } catch {}
        reject(err);
      }
    });
  });
}