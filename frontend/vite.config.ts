import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

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
  ]
});
