import React from "react";

interface PageHeadProps {
  title: React.ReactNode;
  sub?: React.ReactNode;
  /** Right-hand side: actions, big numbers. Wraps under the title on narrow screens. */
  right?: React.ReactNode;
}

/** Page title block: h1 + subtitle, actions on the right. */
export const PageHead: React.FC<PageHeadProps> = ({ title, sub, right }) => (
  <div className="flex flex-wrap items-end justify-between gap-2.5">
    <div className="min-w-0">
      <h1 className="font-head font-bold text-[22px] leading-tight text-tx m-0">{title}</h1>
      {sub && <div className="text-xs text-dim">{sub}</div>}
    </div>
    {right && <div className="flex flex-wrap items-center gap-3">{right}</div>}
  </div>
);

export default PageHead;
