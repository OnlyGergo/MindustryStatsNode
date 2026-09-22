import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  server: {
    port: 4000,
    proxy: {
      // Proxy API calls through to the Bun + Elysia backend during dev.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/config': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({}),
    viteReact(),
    svgr(),
  ]
});
