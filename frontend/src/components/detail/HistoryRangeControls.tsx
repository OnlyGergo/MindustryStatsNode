import { DATE_RANGE_OPTIONS, DateRangeOption } from "../../util/dateRangeConsts.ts";

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
      <div className="flex flex-wrap gap-2 mb-4">
        {DATE_RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => setSelectedRange(option.value)}
            className={`px-3 py-1 text-sm ${
              selectedRange === option.value ? "button-accent" : "button-secondary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {selectedRange === "custom" && (
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label htmlFor={`${idPrefix}-start-date`} className="text-sm text-tertiary">
              From:
            </label>
            <input
              id={`${idPrefix}-start-date`}
              type="date"
              value={customStartDate}
              max={today}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-surface-tertiary border border-default rounded px-3 py-1 text-sm text-primary focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`${idPrefix}-end-date`} className="text-sm text-tertiary">
              To:
            </label>
            <input
              id={`${idPrefix}-end-date`}
              type="date"
              value={customEndDate}
              max={today}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-surface-tertiary border border-default rounded px-3 py-1 text-sm text-primary focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      )}

      {dateError && <div className="text-status-offline text-sm mb-4">{dateError}</div>}

      {fetchError && (
        <div className="text-status-offline text-sm mb-4 bg-status-offline border border-status-offline rounded p-3">
          {fetchError}
        </div>
      )}
    </>
  );
};

export default HistoryRangeControls;
