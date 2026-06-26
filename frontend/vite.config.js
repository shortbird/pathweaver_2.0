import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

// Build identity used for live-update detection. Prefer the git short SHA (stable
// across identical rebuilds); fall back to a build timestamp. Every deploy produces
// a new value, which the running app polls /version.json to detect and prompts a
// safe reload (see src/hooks/useVersionCheck.js).
const BUILD_ID = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return String(Date.now())
  }
})()

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
  define: {
    __APP_VERSION__: JSON.stringify(BUILD_ID),
  },
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

        // Emit version.json so a running tab can detect a newer deploy and offer
        // a safe reload (Render serves it with max-age=0, must-revalidate).
        writeFileSync(join(distDir, 'version.json'), JSON.stringify({ version: BUILD_ID }))
        console.log('Wrote version.json:', BUILD_ID)
      }
    },
    // Upload source maps to Sentry, then delete them from dist so the source is
    // never publicly served (we build with sourcemap:'hidden' below). Only runs
    // when SENTRY_AUTH_TOKEN is present in the build env, so dev builds are
    // unaffected. Must be last so it sees the final bundle + maps.
    process.env.SENTRY_AUTH_TOKEN && sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      telemetry: false,
    }),
  ],
  resolve: {
    alias: {
      // Shared legal content (single source of truth for Terms/Privacy,
      // also consumed by the v2 mobile app). Lives outside the frontend root.
      '@legal': join(process.cwd(), '..', 'shared', 'legal'),
    },
  },
  server: {
    port: 3000,
    // Allow Vite's dev server to read the shared/ folder, which sits one level
    // above the frontend root (needed for the @legal alias above).
    fs: { allow: ['..'] },
    // Tunnel hosts allowed during LTI testing. ngrok-free.dev is our stable
    // dev URL; trycloudflare.com is the legacy quick-tunnel fallback. Remove
    // these entries after the LTI rollout is done.
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.trycloudflare.com', 'localhost'],
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
    // Dev: full inline maps. Prod: only generate 'hidden' maps when we have a
    // Sentry token to upload + delete them (the plugin removes them from dist
    // after upload, so source is never publicly served). Without the token,
    // keep prod maps off entirely — no exposure.
    sourcemap: isProduction ? (process.env.SENTRY_AUTH_TOKEN ? 'hidden' : false) : true,
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