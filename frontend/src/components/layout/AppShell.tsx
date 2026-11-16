import React from "react";
import { Outlet } from "@tanstack/react-router";
import BottomDock from "./BottomDock.tsx";
import TopBar from "./TopBar.tsx";

/** Root layout: top bar, the routed page, and the mobile dock. Colours come from the theme on <html>. */
const AppShell: React.FC = () => (
  <div className="h-dvh bg-bg text-tx flex flex-col overflow-hidden">
    <TopBar />
    <Outlet />
    <BottomDock />
  </div>
);

export default AppShell;
