import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'PROFNOTE',
        short_name: 'PROFNOTE',
        description: "Gestion des notes et évaluations pour enseignants au Bénin",
        theme_color: '#1E3A5F',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Tout ce qui compose l'application est mis en cache pour un démarrage sans internet.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2,webmanifest}'],
        // Le bundle principal embarque xlsx, jsPDF, pdf.js, mammoth, etc. : on relève la limite
        // (5 Mo par défaut) pour qu'aucun fichier de l'application ne soit ignoré silencieusement.
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        // Toute navigation (ex. /classes, /eleves) retombe sur l'application quand il n'y a pas de réseau.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true
        // IMPORTANT : plus de runtimeCaching pour Supabase. Ce cache était commun à tous les
        // comptes d'un même téléphone (fuite possible de données d'un enseignant à un autre).
        // Les données sont désormais mises en cache par utilisateur dans src/lib/offlineCache.ts.
      }
    })
  ],
  server: { port: 5173 }
})
