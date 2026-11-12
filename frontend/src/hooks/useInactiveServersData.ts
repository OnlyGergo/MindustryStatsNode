import { useState, useEffect, useCallback } from 'react';
import { InactiveServerInfo } from '../../../common/models/RepositoryTypes';
import { ServerListStats } from '../../../common/models/serverData';
import { ApiPacker, ApiResponsePacket } from '../../../common/Packer';
import { getBaseUrl } from '../util/getApi';
import { fetchJsonWithRetry } from '../util/fetchRetry';

interface UseInactiveServersDataResult {
  inactiveServers: InactiveServerInfo[];
  stats: ServerListStats[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useInactiveServersData(): UseInactiveServersDataResult {
  const [inactiveServers, setInactiveServers] = useState<InactiveServerInfo[]>([]);
  const [stats, setStats] = useState<ServerListStats[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const baseUrl = getBaseUrl();
      const [serversRaw, statsRaw] = await Promise.all([
        fetchJsonWithRetry<ApiResponsePacket>(`${baseUrl}/api/inactive-servers`),
        fetchJsonWithRetry<ApiResponsePacket>(`${baseUrl}/api/serverlist-stats`),
      ]);

      const serversData: InactiveServerInfo[] = ApiPacker.unpack(serversRaw);
      const statsData: ServerListStats[] = ApiPacker.unpack(statsRaw);

      setInactiveServers(serversData);
      setStats(statsData);
    } catch (err) {
      console.error('Error fetching inactive servers data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [setInactiveServers, setStats, setLoading, setError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { inactiveServers, stats, loading, error, refetch: fetchData };
}