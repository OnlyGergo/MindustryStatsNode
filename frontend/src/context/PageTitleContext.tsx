import React, { createContext, useContext, useState } from "react";

// Temporary: N2 replaces this with route staticData.
interface PageTitleContextValue {
  pageTitle: string;
  setPageTitle: (title: string) => void;
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null);

export const usePageTitle = (): PageTitleContextValue => {
  const ctx = useContext(PageTitleContext);
  if (!ctx) {
    throw new Error("usePageTitle must be used within a PageTitleProvider");
  }
  return ctx;
};

export const PageTitleProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [pageTitle, setPageTitle] = useState<string>("");

  return (
    <PageTitleContext.Provider value={{ pageTitle, setPageTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
};
