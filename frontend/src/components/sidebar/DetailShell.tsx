import React from "react";

interface DetailShellProps {
  children: React.ReactNode;
}

/** Wraps route-level detail content. The page title comes from route `staticData`. */
export const DetailShell: React.FC<DetailShellProps> = ({ children }) => (
  <div className="flex-1 relative h-full overflow-hidden">
    {children}
  </div>
);
