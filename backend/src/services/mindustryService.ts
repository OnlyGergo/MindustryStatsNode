import dgram from 'dgram';
import { GameMode, ServerData } from '../../../common/models/serverData';
import { readString } from '../utils/buffer';
import {MINDUSTRY_TIMEOUT_MILLISECONDS} from "../const";

// Cache failed attempts to avoid excessive logging
const failedServersCache = new Set<string>();

export async function getServerData(host: string, port: number): Promise<ServerData | null> {
  const serverKey = `${host}:${port}`;
  
  return new Promise((resolve, reject) => {
    try {
      const socket = dgram.createSocket('udp4');
      const pingTime = Date.now();

      // Prepare the request packet - {-2, 1}
      const packet = Buffer.from([0xFE, 0x01]); // 0xFE is -2 in two's complement
      
      // Set timeout to avoid hanging
      const timeout = setTimeout(() => {
        try {
          socket.close();
        } catch (err) {}
        
        // Only log if it's the first failure
        if (!failedServersCache.has(serverKey)) {
          console.warn(`Server request timed out for ${serverKey}`);
          failedServersCache.add(serverKey);
        }
        else
        {
          // Delete on success
          failedServersCache.delete(serverKey);
        }
        
        resolve(null);
      }, MINDUSTRY_TIMEOUT_MILLISECONDS); // Shorter timeout for faster performance
      
      socket.on('error', (err) => {
        clearTimeout(timeout);

        try {
          socket.close();
        } catch (closeErr) {
          // Ignore errors when closing an already closed socket
        }

        // Only log if it's the first failure
        if (!failedServersCache.has(serverKey)) {
          if (err.message.startsWith("getaddrinfo ENOTFOUND")) {
            console.warn(`Unable to resolve domain (getaddrinfo ENOTFOUND) for ${serverKey}`);
            resolve(null);
          }

          failedServersCache.add(serverKey);
          console.warn(`Error connecting to ${serverKey}: ${err.message}`);
        }

        reject(err);
      });
      
      socket.on('message', (message) => {
        clearTimeout(timeout);
        try {
          const buffer = Buffer.from(message);
          const offset = { value: 0 };
          
          // Parse the response
          const serverName = readString(buffer, offset);
          const map = readString(buffer, offset);
          
          // Read integers - Mindustry uses Big Endian
          const players = buffer.readInt32BE(offset.value);
          offset.value += 4;
          
          const wave = buffer.readInt32BE(offset.value);
          offset.value += 4;
          
          const version = buffer.readInt32BE(offset.value);
          offset.value += 4;
          
          const versionType = readString(buffer, offset);
          
          // Read game mode
          const gameModeIdx = buffer[offset.value] & 0xFF;
          offset.value += 1;
          const gamemode = gameModeIdx < Object.keys(GameMode).length / 2 
            ? gameModeIdx as GameMode
            : GameMode.SURVIVAL;
          
          const playerLimit = buffer.readInt32BE(offset.value);
          offset.value += 4;
          
          const description = readString(buffer, offset);
          const modeName = readString(buffer, offset);
          
          // Server responded, remove from failed cache if present
          failedServersCache.delete(serverKey);
          
          const serverData: ServerData = {
            ping: Date.now() - pingTime,
            host,
            port,
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
          };
          
          socket.close();
          resolve(serverData);
        } catch (err) {
          socket.close();
          reject(err);
        }
      });
      
      socket.send(packet, 0, packet.length, port, host);
    } catch (err) {
      reject(err);
    }
  });
}
