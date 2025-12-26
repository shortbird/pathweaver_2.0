import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Bundle analyzer - only in analyze mode
    mode === 'analyze' && visualizer({
      filename: './dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
    {
      name: 'copy-static-files',
      closeBundle() {
        const distDir = join(process.cwd(), 'dist')
        
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true })
        }
        
        // Copy _redirects
        const redirectsSource = join(process.cwd(), 'public', '_redirects')
        const redirectsDest = join(distDir, '_redirects')
        if (existsSync(redirectsSource)) {
          copyFileSync(redirectsSource, redirectsDest)
          console.log('Copied _redirects file to dist folder')
        }
        
        // Copy index.html as 404.html for SPA routing
        const indexSource = join(distDir, 'index.html')
        const notFoundDest = join(distDir, '404.html')
        if (existsSync(indexSource)) {
          copyFileSync(indexSource, notFoundDest)
          console.log('Copied index.html as 404.html for SPA routing')
        }
      }
    }
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Core React libraries - most used, highest priority for caching
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-core';
          }
          if (id.includes('node_modules/react-router-dom')) {
            return 'react-router';
          }

          // Heavy chart libraries - lazy load on demand
          if (id.includes('node_modules/recharts')) {
            return 'recharts';
          }
          if (id.includes('node_modules/@fullcalendar')) {
            return 'fullcalendar';
          }

          // UI libraries - moderate size, frequently used
          if (id.includes('node_modules/@heroicons/react')) {
            return 'heroicons';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'framer-motion';
          }

          // DnD libraries
          if (id.includes('node_modules/@dnd-kit')) {
            return 'dnd-kit';
          }

          // Utilities - small, frequently used
          if (id.includes('node_modules/axios')) {
            return 'axios';
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'react-query';
          }

          // Split large admin pages into separate chunks
          if (id.includes('/pages/Admin')) {
            return 'admin-pages';
          }

          // Other vendor code
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  }
}))