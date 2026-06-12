import React from 'react'
import ReactDOM from 'react-dom/client'
// Optimized font loading: Only load necessary weights and latin subset
// This reduces bundle size by ~200KB by excluding unused weights and devanagari subset
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/600.css'
import App from './App'
import './index.css'
import { initSentry } from './services/sentry'

// Initialize error tracking as early as possible (no-op without VITE_SENTRY_DSN).
initSentry()

// Register service worker for push notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[Main] Service Worker registered:', registration.scope)
      })
      .catch((error) => {
        console.warn('[Main] Service Worker registration failed:', error)
      })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)