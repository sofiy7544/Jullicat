import { defineConfig, type Plugin } from 'vite';
import { networkInterfaces } from 'node:os';

const API = process.env.API_TARGET || 'http://localhost:8787';

/** Печатает адрес для открытия игры с iPhone в той же Wi-Fi сети. */
function lanUrl(): Plugin {
  return {
    name: 'lan-url',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer!.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5173;
        const ips = Object.values(networkInterfaces()).flat()
          .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i!.address);
        setTimeout(() => {
          console.log('\n  \x1b[1m\x1b[35m📱 Открой на iPhone (та же Wi-Fi):\x1b[0m');
          for (const ip of ips) console.log(`     \x1b[1mhttp://${ip}:${port}\x1b[0m`);
          console.log('');
        }, 50);
      });
    },
  };
}

export default defineConfig({
  plugins: [lanUrl()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/ws': { target: API.replace(/^http/, 'ws'), ws: true },
    },
  },
  preview: { host: '0.0.0.0', port: 4173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
