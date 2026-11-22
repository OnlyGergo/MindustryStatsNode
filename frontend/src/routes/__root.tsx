import type React from "react";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import type { RouterContext } from "../router.tsx";
import AppShell from "../components/layout/AppShell.tsx";
import { AuthProvider } from "../context/AuthContext.tsx";
import appCss from "../index.css?url";
import { DEFAULT_THEME, themeVars } from "../../../common/theme.ts";

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@600;700&display=swap";

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Mindustry Tracker" },
      { name: "description", content: "Mindustry Stats is a web application that provides real-time statistics and analytics for Mindustry servers." },
      { name: "theme-color", content: DEFAULT_THEME.topbg },
      { name: "color-scheme", content: "dark" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Mindustry Tracker" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: FONTS_URL },
      { rel: "stylesheet", href: appCss },
      // The tab variant (bolder, cropped) from `bun run icons`; favicon.svg stays the top bar logo.
      { rel: "icon", type: "image/svg+xml", href: "/favicon-tab.svg" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    // The site theme lives on <html>; [data-theme] makes index.css re-derive
    // --top/--grid/... from it. A page can override it on any wrapper element.
    <html lang="en" data-theme style={themeVars(DEFAULT_THEME) as React.CSSProperties}>
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
