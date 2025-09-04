import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-redirects',
      closeBundle() {
        const source = join(process.cwd(), 'public', '_redirects')
        const distDir = join(process.cwd(), 'dist')
        const dest = join(distDir, '_redirects')
        
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true })
        }
        
        if (existsSync(source)) {
          copyFileSync(source, dest)
          console.log('Copied _redirects file to dist folder')
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
    sourcemap: true
  }
})