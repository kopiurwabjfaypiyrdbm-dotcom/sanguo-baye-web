import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/',
        name: '三国霸业',
        short_name: '三国霸业',
        description: '面向手机横屏的《三国霸业》现代 Web 复刻。',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#101b19',
        theme_color: '#101b19',
        categories: ['games', 'strategy'],
        icons: [
          {
            src: 'icons/app-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/app-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/app-icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,json,webp,png,svg}'],
        globIgnores: [
          '**/Video-1785141282737-*.mp4',
          '**/period-selection-background-*.png',
        ],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(?:Video-1785141282737|period-selection-background)-[^/]+\.(?:mp4|png)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'entry-media-v1',
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/.reference/**', '**/references/vendor/**'],
    },
  },
});
