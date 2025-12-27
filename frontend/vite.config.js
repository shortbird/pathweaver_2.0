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
          // Vendor chunks (most stable, best for caching)
          if (id.includes('node_modules')) {
            // Core React bundle - most stable, best for caching
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            // UI libraries
            if (id.includes('@heroicons') || id.includes('framer-motion')) {
              return 'ui-vendor';
            }
            // Heavy chart libraries
            if (id.includes('recharts')) {
              return 'recharts';
            }
            // Calendar library
            if (id.includes('@fullcalendar')) {
              return 'fullcalendar';
            }
            // Form libraries
            if (id.includes('react-hook-form') || id.includes('yup')) {
              return 'forms-vendor';
            }
            // API & State management
            if (id.includes('axios') || id.includes('@tanstack/react-query')) {
              return 'utils-vendor';
            }
            // All other vendors
            return 'vendor';
          }

          // Application code chunks (by route/feature)
          // Admin pages - large bundle, accessed only by admins
          if (id.includes('/pages/AdminPage') || id.includes('/components/admin/')) {
            return 'admin';
          }
          // Quest & Badge pages - core functionality
          if (id.includes('/pages/Quest') || id.includes('/pages/Badge') || id.includes('/components/quest/') || id.includes('/components/badges/')) {
            return 'quests-badges';
          }
          // Parent pages - role-specific
          if (id.includes('/pages/ParentDashboard') || id.includes('/pages/ParentQuest') || id.includes('/components/parent/')) {
            return 'parent';
          }
          // Observer pages - role-specific
          if (id.includes('/pages/Observer') || id.includes('/components/observer/')) {
            return 'observer';
          }
          // Advisor pages - role-specific
          if (id.includes('/pages/Advisor') || id.includes('/components/advisor/')) {
            return 'advisor';
          }
          // Diploma/Portfolio - public-facing, can be separate
          if (id.includes('/pages/DiplomaPage') || id.includes('/components/diploma/')) {
            return 'diploma';
          }
        },
      },
    },
  }
}))