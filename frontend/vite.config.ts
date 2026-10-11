import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { VitePWA } from 'vite-plugin-pwa';

const backend = { target: 'http://localhost:3000', changeOrigin: true };

export default defineConfig({
  server: {
    port: 4000,
    strictPort: true,
    // The page is normally opened through the backend (:3000), which proxies to
    // this server, but the HMR websocket connects here directly.
    hmr: { clientPort: 4000 },
    // Only used when opening :4000 directly - the backend owns these routes.
    proxy: {
      '/api': backend,
      '/config': backend,
      '/sitemap.xml': backend,
    },
  },
  build: {
    // Stack traces in the browser and on the server map back to the source files.
    sourcemap: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({}),
    viteReact(),
    svgr(),
    // Manifest only: no service worker, no offline caching (live SSR stats must never be served stale).
    VitePWA({
      injectRegister: false,
      manifestFilename: 'manifest.webmanifest',
      pwaAssets: { disabled: true },
      devOptions: { enabled: false },
      manifest: {
        id: '/',
        name: 'Mindustry Stats',
        short_name: 'Mindustry Stats',
        description: 'Real-time statistics and analytics for Mindustry servers.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f0f0f',
        theme_color: '#0f0f0f',
        categories: ['games', 'utilities'],
        lang: 'en',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ]
});
