import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Split into smaller chunks so no single bundle file is too large
        // to move/deploy safely in one piece.
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('leaflet')) return 'vendor-leaflet'
            if (id.includes('react')) return 'vendor-react'
            if (id.includes('@supabase')) return 'vendor-supabase'
            return 'vendor'
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@rbr/shared': path.resolve(__dirname, '../shared'),
      // shared/ lives outside this app's node_modules tree, so bare imports
      // it makes (react, supabase-js, leaflet) need an explicit pointer back
      // here — otherwise the bundler resolution that walks up from shared/
      // never finds them.
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      '@supabase/supabase-js': path.resolve(__dirname, 'node_modules/@supabase/supabase-js'),
      leaflet: path.resolve(__dirname, 'node_modules/leaflet'),
      'react-leaflet': path.resolve(__dirname, 'node_modules/react-leaflet'),
    },
  },
})
