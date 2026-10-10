import React from "react";
import { Outlet } from "@tanstack/react-router";
import AnimatedBackground from "./AnimatedBackground.tsx";
import TopBar from "./TopBar.tsx";

/** Root layout: background, top bar, and the routed page below it. */
const AppShell: React.FC = () => (
  <div className="h-screen bg-linear-to-br from-stone-900 via-neutral-900 to-stone-900 text-white flex flex-col overflow-hidden">
    <AnimatedBackground />
    <TopBar />
    <Outlet />
  </div>
);

export default AppShell;
