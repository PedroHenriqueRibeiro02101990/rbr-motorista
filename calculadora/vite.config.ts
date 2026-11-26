import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
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
      // shared/ fica fora desta pasta: os imports soltos dele precisam apontar de volta para cá.
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      '@supabase/supabase-js': path.resolve(__dirname, 'node_modules/@supabase/supabase-js'),
    },
  },
})
