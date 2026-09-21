import React from "react";
import { createRootRoute, Outlet, HeadContent, Scripts } from "@tanstack/react-router";
import MasterPanel from "../components/sidebar/MasterPanel";
import NavBar from "../components/navbar/NavBar.tsx";
import { fetchServers } from "../hooks/useApi.ts";
import { SidebarProvider, useSidebar } from "../context/SidebarContext.tsx";
import appCss from "../index.css?url";
import { ApiPacker } from "../../../common/Packer.ts";
import { ServerElement } from "../../../common/models/serverData.ts";

const AnimatedBackground: React.FC = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none">
    <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-500/10 rounded blur-3xl animate-pulse"></div>
    <div
      className="absolute -bottom-40 -left-40 w-80 h-80 bg-amber-500/10 rounded blur-3xl animate-pulse"
      style={{ animationDelay: "1s" }}
    ></div>
    <div
      className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-orange-600/5 rounded blur-3xl animate-pulse"
      style={{ animationDelay: "2s" }}
    ></div>
  </div>
);

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mindustry Stats" },
      { name: "description", content: "Mindustry Stats is a web application that provides real-time statistics and analytics for Mindustry servers." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  // SSR-fetched on first load; the client hook (useApi) takes over polling afterward.
  loader: async () => {
    const data = await fetchServers();
    return { initialData: data };
  },
  component: RootComponent,
});

function RootLayout() {
  const { isMobile, showMasterPanel } = useSidebar();

  return (
    <div className="h-screen bg-linear-to-br from-stone-900 via-neutral-900 to-stone-900 text-white flex flex-col overflow-hidden">
      <AnimatedBackground />
      <NavBar />
      <div className="flex-1 flex min-h-0">
        {(!isMobile || showMasterPanel) && <MasterPanel />}
        {(!isMobile || !showMasterPanel) && (
          <div className="flex-1" style={{ minWidth: 0 }}>
            <Outlet />
          </div>
        )}
      </div>
    </div>
  );
}

function RootComponent() {
  const initialData = ApiPacker.unpack<ServerElement>(Route.useLoaderData().initialData);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <SidebarProvider initialData={initialData}>
          <RootLayout />
        </SidebarProvider>
        <Scripts />
      </body>
    </html>
  );
}
