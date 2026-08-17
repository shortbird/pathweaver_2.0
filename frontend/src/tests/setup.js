import { expect, afterEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// findBy*/waitFor default to 1s, which is shorter than the 5s testTimeout this
// project sets in vitest.config.mjs - so a test the config considers to have
// four seconds left will already have failed. What that costs is a flake in
// whichever test renders first in a file: it pays for the cold-start module
// transform, and on a slow runner it loses to the 1s cap on timing alone.
// schoolPageCarpool.test.jsx failed exactly this way (its own first test, the
// other six green, and the whole file green when the cap is lifted). Align the
// two so only genuinely stuck assertions fail; a passing suite waits no longer.
configure({ asyncUtilTimeout: 5000 })

// Mock focus-trap-react globally to avoid focus trap issues in jsdom
// Focus traps require tabbable elements which jsdom doesn't properly support
vi.mock('focus-trap-react', () => ({
  default: ({ children }) => children
}))

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value) },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true })

// Cleanup after each test case
afterEach(() => {
  cleanup()
  localStorage.clear()
})

// Mock window.matchMedia (used by responsive components)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver (used by lazy loading, infinite scroll)
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
}

// Mock ResizeObserver (used by some chart libraries)
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
}

// Mock scrollTo (used by navigation, modals)
global.scrollTo = vi.fn()

// Mock IndexedDB (used by secureTokenStore)
global.indexedDB = {
  open: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: {
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          get: vi.fn(() => ({ onsuccess: null, onerror: null })),
          put: vi.fn(() => ({ onsuccess: null, onerror: null })),
          delete: vi.fn(() => ({ onsuccess: null, onerror: null })),
        })),
      })),
      close: vi.fn(),
    },
  })),
  deleteDatabase: vi.fn(),
}

// Mock canvas (used by canvas-confetti, charts)
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(),
  putImageData: vi.fn(),
  createImageData: vi.fn(),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  fillText: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
}))

// Mock crypto.subtle (used by secureTokenStore for encryption)
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      importKey: vi.fn(),
      exportKey: vi.fn(),
      generateKey: vi.fn(),
      encrypt: vi.fn(),
      decrypt: vi.fn(),
    },
    getRandomValues: vi.fn((arr) => arr),
  },
  writable: true,
  configurable: true,
})

// Suppress console errors in tests (optional - comment out if you want to see them)
// global.console.error = vi.fn()
// global.console.warn = vi.fn()
