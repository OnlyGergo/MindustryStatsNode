import Segmented from "../ui/Segmented.tsx";
import { DATE_RANGE_OPTIONS, DateRangeOption } from "../../util/chartHelpers.ts";

interface HistoryRangeControlsProps {
  idPrefix: string;
  selectedRange: DateRangeOption;
  setSelectedRange: (range: DateRangeOption) => void;
  customStartDate: string;
  setCustomStartDate: (value: string) => void;
  customEndDate: string;
  setCustomEndDate: (value: string) => void;
  dateError: string | null;
  fetchError: string | null;
}

/** Preset buttons, custom date inputs and error banners shared by the history charts. */
const HistoryRangeControls = ({
  idPrefix,
  selectedRange,
  setSelectedRange,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  dateError,
  fetchError,
}: HistoryRangeControlsProps) => {
  // Get today's date for max attribute on date inputs
  const today = new Date().toISOString().split("T")[0];

  return (
    <>
      <Segmented
        aria-label="Range"
        className="mb-3"
        options={DATE_RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        value={selectedRange}
        onChange={setSelectedRange}
      />

      {selectedRange === "custom" && (
        <div className="flex flex-wrap gap-4 mb-3">
          <div className="flex items-center gap-2">
            <label htmlFor={`${idPrefix}-start-date`} className="text-xs text-dim">
              From:
            </label>
            <input
              id={`${idPrefix}-start-date`}
              type="date"
              value={customStartDate}
              max={today}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="field w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`${idPrefix}-end-date`} className="text-xs text-dim">
              To:
            </label>
            <input
              id={`${idPrefix}-end-date`}
              type="date"
              value={customEndDate}
              max={today}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="field w-auto"
            />
          </div>
        </div>
      )}

      {dateError && <div className="text-bad text-sm mb-3">{dateError}</div>}

      {fetchError && (
        <div className="text-bad text-sm mb-3 border border-bad/40 rounded-ui p-3">
          {fetchError}
        </div>
      )}
    </>
  );
};

export default HistoryRangeControls;
