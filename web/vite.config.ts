import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      workbox: {
        importScripts: ['push-sw.js'],
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [{ urlPattern: /^https:\/\/api\.dicebear\.com\//, handler: 'CacheFirst', options: { cacheName: 'avatars', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } } }],
      },
      manifest: {
        name: 'Reconhecimento',
        short_name: 'Reconhecer',
        description: 'Reconhecimento e missões do time',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5190,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
  },
});
