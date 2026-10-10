import { createRootRoute, Outlet, HeadContent, Scripts } from "@tanstack/react-router";
import AnimatedBackground from "../components/layout/AnimatedBackground.tsx";
import NavBar from "../components/navbar/NavBar.tsx";
import { PageTitleProvider } from "../context/PageTitleContext.tsx";
import { AuthProvider } from "../context/AuthContext.tsx";
import appCss from "../index.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mindustry Stats" },
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

function RootLayout() {
  return (
    <div className="h-screen bg-linear-to-br from-stone-900 via-neutral-900 to-stone-900 text-white flex flex-col overflow-hidden">
      <AnimatedBackground />
      <NavBar />
      <Outlet />
    </div>
  );
}

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <PageTitleProvider>
            <RootLayout />
          </PageTitleProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
