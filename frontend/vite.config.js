import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
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
    // Disable source maps in production to prevent source code exposure
    sourcemap: !isProduction,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor chunks (most stable, best for caching)
          if (id.includes('node_modules')) {
            // Core React bundle - most stable, best for caching
            // CRITICAL: Include ALL React-dependent packages to prevent load order issues
            // that cause "Cannot read properties of undefined (reading 'useLayoutEffect')" errors
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router') ||
                id.includes('@dnd-kit') || id.includes('@stripe/react-stripe-js') ||
                id.includes('react-hot-toast') || id.includes('react-helmet-async') ||
                id.includes('qrcode.react') || id.includes('react-masonry-css') ||
                id.includes('react-ga4') || id.includes('focus-trap-react') ||
                id.includes('react-hook-form') || id.includes('@tanstack/react-query') ||
                id.includes('@fullcalendar/react') || id.includes('@tiptap') ||
                id.includes('framer-motion') || id.includes('use-sync-external-store') ||
                id.includes('recharts') || id.includes('react-pdf')) {
              return 'react-vendor';
            }
            // UI libraries (React-independent)
            if (id.includes('@heroicons')) {
              return 'ui-vendor';
            }
            // Calendar library core (non-React parts)
            if (id.includes('@fullcalendar') && !id.includes('@fullcalendar/react')) {
              return 'fullcalendar';
            }
            // Form validation (React-independent)
            if (id.includes('yup')) {
              return 'forms-vendor';
            }
            // API client (React-independent)
            if (id.includes('axios')) {
              return 'utils-vendor';
            }
            // PostHog session replay (~45KB gzipped, separate for caching)
            if (id.includes('posthog')) {
              return 'posthog'
            }
            // All other vendors
            return 'vendor';
          }
          // Let Vite handle application code splitting automatically
          // Manual app chunks were causing load order issues with React
        },
      },
    },
  }
}})