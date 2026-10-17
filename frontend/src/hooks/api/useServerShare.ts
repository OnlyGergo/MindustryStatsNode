import { ServerShareEntry } from "../../../../common/models/GlobalStatsTypes.js";
import { PresetRange } from "../../util/chartHelpers.ts";
import { ApiPacker, type ApiResponsePacket } from "../../../../common/Packer.ts";
import { useChartData } from "../useChartData.ts";

const EMPTY: ServerShareEntry[] = [];
const parse = (json: unknown) => ApiPacker.unpack<ServerShareEntry>(json as ApiResponsePacket);

export function useServerShare(gamemodeId: number | undefined, range: PresetRange) {
    const { data, loading, error } = useChartData(
        gamemodeId ? `/api/gamemodes/${gamemodeId}/servers?range=${range}` : null,
        parse,
        "Unable to load server share data.",
    );
    return { data: data ?? EMPTY, loading, error };
}
