import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://hosting.gergo.tech:2938',
                changeOrigin: true,
                ws: true,
            },
            '/ws': {
                target: 'http://hosting.gergo.tech:2938',
                changeOrigin: true,
                ws: true,
            }
        }
    },
});