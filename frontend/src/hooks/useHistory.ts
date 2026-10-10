import { useState, useEffect } from "react";
import { ApiPacker } from "../../../common/Packer";
import { DateRangeOption } from "../util/dateRangeConsts";
import { getBaseUrl } from "../util/getApi";

export enum HistoryType {
  Network = "network",
  Server = "server"
}

function getEndpointBaseUrl(id: number | string, type: HistoryType): string {
  const endpointBaseUrl = getBaseUrl();
  switch (type) {
    case HistoryType.Network:
      return `${endpointBaseUrl}/api/networks/${id}/history`;
    case HistoryType.Server:
      return `${endpointBaseUrl}/api/servers/${id}/history`;
    default:
      throw new Error(`Unknown history type: ${type}`);
  }
}

/**
 * Range selection shared by every network/server history chart: the selected
 * preset or custom dates, their validation, and the resulting query string
 * (`null` while there is nothing valid to fetch yet).
 */
export function useHistoryRange() {
  const [selectedRange, setSelectedRange] = useState<DateRangeOption>("1d");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  let dateError: string | null = null;
  let queryString: string | null = `range=${selectedRange}`;

  if (selectedRange === "custom") {
    queryString = null;
    if (customStartDate && customEndDate) {
      const startTs = new Date(customStartDate).getTime();
      const endTs = new Date(customEndDate).getTime();
      if (endTs <= startTs) {
        dateError = "End date must be after start date";
      } else {
        queryString = `startDate=${startTs}&endDate=${endTs}`;
      }
    }
  }

  return {
    selectedRange,
    setSelectedRange,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    dateError,
    queryString,
  };
}

export function useHistory<T>(id: number | string, type: HistoryType) {
  const range = useHistoryRange();
  const { queryString } = range;

  const [chartData, setChartData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const endpointBaseUrl = getEndpointBaseUrl(id, type);

  useEffect(() => {
    if (queryString === null) return;

    const fetchHistoryData = async () => {
      setLoading(true);
      setFetchError(null);

      try {
        const response = await fetch(`${endpointBaseUrl}?${queryString}`);
        if (!response.ok) {
          throw new Error(`Status ${response.status}: ${response.statusText}`);
        }

        const data = ApiPacker.unpack<T>(await response.json());
        setChartData(data);
      } catch (error) {
        console.error("Error fetching history data:", error);
        setFetchError("Unable to load history data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistoryData();
  }, [queryString, endpointBaseUrl]);

  return {
    chartData,
    loading,
    fetchError,
    ...range,
  };
}
