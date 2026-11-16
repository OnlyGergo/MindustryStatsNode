import React from "react";
import { Outlet } from "@tanstack/react-router";
import BottomDock from "./BottomDock.tsx";
import TopBar from "./TopBar.tsx";

/** Root layout: top bar, the routed page, and the mobile dock. The background is body's (index.css), so a page customisation's image on <body> shows through. */
const AppShell: React.FC = () => (
  <div className="h-dvh text-tx flex flex-col overflow-hidden">
    <TopBar />
    <Outlet />
    <BottomDock />
  </div>
);

export default AppShell;
