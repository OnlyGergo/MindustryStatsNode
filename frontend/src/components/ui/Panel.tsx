import React from "react";

export type PanelSize = "sm" | "md" | "lg" | "full";

const SIZE: Record<PanelSize, string> = {
  sm: "panel-sm",
  md: "panel-md",
  lg: "panel-lg",
  full: "panel-full",
};

interface PanelProps {
  title?: React.ReactNode;
  /** Right side of the title row: a Segmented, a caption, a button. */
  controls?: React.ReactNode;
  /** Width inside a `panel-row`. Omit outside one. */
  size?: PanelSize;
  className?: string;
  id?: string;
  children?: React.ReactNode;
}

/** The box every page section lives in. See THEME.md, "Layout". */
export const Panel: React.FC<PanelProps> = ({ title, controls, size, className = "", id, children }) => (
  <section id={id} className={`panel ${size ? SIZE[size] : ""} ${className}`}>
    {(title || controls) && (
      <div className="panel-head">
        {title && <h2 className="panel-title">{title}</h2>}
        {controls}
      </div>
    )}
    {children}
  </section>
);

export default Panel;
