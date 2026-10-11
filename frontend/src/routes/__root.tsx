import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import AppShell from "../components/layout/AppShell.tsx";
import { AuthProvider } from "../context/AuthContext.tsx";
import appCss from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Mindustry Tracker" },
      { name: "description", content: "Mindustry Stats is a web application that provides real-time statistics and analytics for Mindustry servers." },
      { name: "theme-color", content: "#0f0f0f"}
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
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
