import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1200 },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/ws': { target: 'ws://127.0.0.1:8000', ws: true },
    },
  },
});
