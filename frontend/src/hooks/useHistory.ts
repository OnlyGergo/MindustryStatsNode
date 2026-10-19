import { useState } from "react";
import { ApiPacker, type ApiResponsePacket } from "../../../common/Packer";
import { DateRangeOption } from "../util/chartHelpers";
import { useChartData } from "./useChartData";

export enum HistoryType {
  Network = "network",
  Server = "server"
}

function getEndpointPath(id: number | string, type: HistoryType): string {
  switch (type) {
    case HistoryType.Network:
      return `/api/networks/${id}/history`;
    case HistoryType.Server:
      return `/api/servers/${id}/history`;
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

const EMPTY: never[] = [];
const unpackRows = (json: unknown) => ApiPacker.unpack(json as ApiResponsePacket);

export function useHistory<T>(id: number | string, type: HistoryType) {
  const range = useHistoryRange();
  const { queryString } = range;

  const url = queryString === null ? null : `${getEndpointPath(id, type)}?${queryString}`;
  const { data, loading, error } = useChartData(url, unpackRows, "Unable to load history data. Please try again later.");

  return {
    chartData: (data ?? EMPTY) as T[],
    loading,
    fetchError: error,
    ...range,
  };
}
