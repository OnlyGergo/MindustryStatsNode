import React, { useEffect, useState } from "react";
import type { WrappedReport } from "../../../../common/models/leaderboard.ts";
import WrappedPage from "./WrappedPage.tsx";
import WrappedStory from "./WrappedStory.tsx";

const key = (year: number) => `wrapped-skip-${year}`;

/** Picks between the story and the full summary. Story first on the server. */
const WrappedView: React.FC<{ report: WrappedReport; summaryFirst?: boolean }> = ({ report, summaryFirst }) => {
  const [view, setView] = useState<"story" | "summary">(summaryFirst ? "summary" : "story");

  useEffect(() => {
    try {
      if (!summaryFirst && sessionStorage.getItem(key(report.year)) === "1") setView("summary");
    } catch {
      /* storage unavailable */
    }
  }, [report.year, summaryFirst]);

  const toSummary = () => {
    try {
      sessionStorage.setItem(key(report.year), "1");
    } catch {
      /* ignore */
    }
    setView("summary");
  };
  const toStory = () => {
    try {
      sessionStorage.removeItem(key(report.year));
    } catch {
      /* ignore */
    }
    setView("story");
  };

  return view === "story" ? (
    <WrappedStory report={report} onSkip={toSummary} />
  ) : (
    <WrappedPage report={report} onPlayStory={toStory} />
  );
};

export default WrappedView;
