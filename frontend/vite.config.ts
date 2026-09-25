/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// In Docker the agent is reachable as http://agent:8765; override with AGENT_URL.
const agent = process.env.AGENT_URL ?? 'http://agent:8765';
const proxied = ['/api', '/plugin', '/downloads', '/local', '/webcam'];

export default defineConfig({
  plugins: [svelte()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
    // The Playwright container reaches the dev server as http://frontend:5173.
    allowedHosts: ['frontend'],
    // Bind mounts from Windows do not deliver file system events: poll instead.
    watch: process.env.CHOKIDAR_USEPOLLING ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      ...Object.fromEntries(proxied.map((p) => [p, { target: agent, changeOrigin: true }])),
      '/sockjs': { target: agent, changeOrigin: true, ws: true },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    // preview.html (1024x600 frame) is shipped too, handy to check a release build from a PC.
    rollupOptions: {
      input: { main: 'index.html', preview: 'preview.html' },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
