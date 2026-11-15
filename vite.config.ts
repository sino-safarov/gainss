import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/gainss/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // A page of its own, not a route of the app.
        navigateFallbackDenylist: [/\/privacy\.html/],
      },
      manifest: {
        name: 'Gainss — дневник тренировок',
        short_name: 'Gainss',
        lang: 'ru',
        start_url: '/gainss/',
        scope: '/gainss/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0d10',
        theme_color: '#0b0d10',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { include: ['tests/unit/**/*.test.ts'] },
})
