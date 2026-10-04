import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The browser only talks to the gateway; same origin in development through this proxy.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': process.env.GATEWAY_URL ?? 'http://127.0.0.1:3000' },
  },
});
