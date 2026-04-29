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
    // Allow the cloudflared tunnel host so Canvas can iframe the dev server
    // during LTI testing. `.trycloudflare.com` covers any quick-tunnel URL.
    // Remove these entries after the LTI rollout is done.
    allowedHosts: ['.trycloudflare.com', 'localhost'],
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      // Backend LTI protocol endpoints. Use a regex anchored to `/lti/` (with
      // trailing slash) so it matches `/lti/login`, `/lti/launch`, etc., but
      // NOT the iframe React routes `/lti-launch`, `/lti-deep-link`, etc.
      '^/lti/.*': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
      '/.well-known': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
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
          if (id.includes('node_modules')) {
            // PostHog is large and React-independent, safe to separate
            if (id.includes('posthog')) {
              return 'posthog'
            }
            // All other vendor deps in one chunk to prevent load order / TDZ issues
            // between React and React-dependent libraries
            return 'vendor';
          }
        },
      },
    },
  }
}})