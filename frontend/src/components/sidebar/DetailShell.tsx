import React, { useEffect } from "react";
import { usePageTitle } from "../../context/PageTitleContext";

interface DetailShellProps {
  title: string;
  children: React.ReactNode;
}

/**
 * Wraps route-level detail content. Publishes its title to PageTitleContext so
 * NavBar can display it in place of the brand bar on mobile detail views.
 */
export const DetailShell: React.FC<DetailShellProps> = ({ title, children }) => {
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle(title);
  }, [title, setPageTitle]);

  return (
    <div className="flex-1 relative h-full overflow-hidden">
      {children}
    </div>
  );
};
