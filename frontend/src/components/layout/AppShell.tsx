import React from "react";
import { Outlet } from "@tanstack/react-router";
import AnimatedBackground from "./AnimatedBackground.tsx";
import BottomDock from "./BottomDock.tsx";
import TopBar from "./TopBar.tsx";

/** Root layout: background, top bar, the routed page, and the mobile dock. */
const AppShell: React.FC = () => (
  <div className="h-dvh bg-linear-to-br from-stone-900 via-neutral-900 to-stone-900 text-white flex flex-col overflow-hidden">
    <AnimatedBackground />
    <TopBar />
    <Outlet />
    <BottomDock />
  </div>
);

export default AppShell;
