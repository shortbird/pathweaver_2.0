import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom for DOM simulation
    environment: 'jsdom',

    // Setup file to run before each test file
    setupFiles: ['./src/tests/setup.js'],

    // Global test utilities (available without importing)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/',
        '**/*.test.{js,jsx}',
        '**/*.spec.{js,jsx}',
        '**/dist/**',
        '**/*.config.js',
      ],
      // Target: 10% Month 1, 20% Month 2, 30% Month 3, etc.
      thresholds: {
        statements: 0,  // Will increase incrementally
        branches: 0,
        functions: 0,
        lines: 0
      }
    },

    // File patterns to include
    include: ['src/**/*.{test,spec}.{js,jsx}'],

    // Timeout for tests (5 seconds default)
    testTimeout: 5000,

    // Mock CSS modules and assets
    css: {
      modules: {
        classNameStrategy: 'non-scoped'
      }
    }
  },

  // Path resolution (same as Vite)
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@services': path.resolve(__dirname, './src/services'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
    }
  }
})
