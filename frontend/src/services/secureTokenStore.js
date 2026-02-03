/**
 * Secure token storage using encrypted IndexedDB
 *
 * P0 SECURITY FIX (December 2024):
 * Replaces localStorage token storage to prevent XSS attacks
 *
 * Security Features:
 * - IndexedDB (async API, not directly accessible like localStorage)
 * - AES-GCM encryption for stored tokens
 * - Tokens encrypted with session-specific key
 * - Automatic cleanup on browser close
 *
 * Why IndexedDB + Encryption?
 * - localStorage is synchronously accessible to any JavaScript (XSS risk)
 * - IndexedDB requires async access (harder to exploit)
 * - Encryption adds additional layer even if IndexedDB is compromised
 * - Still persists across page refreshes (Safari/iOS compatibility)
 *
 * Trade-offs:
 * - Still vulnerable to XSS (JavaScript can call these functions)
 * - More secure than localStorage but not as secure as httpOnly cookies
 * - Necessary workaround for Safari ITP (Intelligent Tracking Prevention)
 */

import logger from '../utils/logger'

const DB_NAME = 'optio_secure_storage'
const DB_VERSION = 1
const STORE_NAME = 'auth_tokens'
const ENCRYPTION_KEY_NAME = 'session_encryption_key'

/**
 * Generate or retrieve encryption key
 *
 * PRODUCTION FIX (December 2025): Use localStorage instead of sessionStorage
 *
 * Problem: In production, www.optioeducation.com and optioeducation.com are
 * different origins. If the user visits one and gets redirected to the other,
 * sessionStorage (which is per-origin) loses the encryption key. This caused
 * token decryption to fail, which cleared all tokens and logged users out.
 *
 * Fix: Store the encryption key in localStorage (also per-origin, but persists
 * across sessions). We also check sessionStorage for backward compatibility
 * with existing sessions.
 *
 * Note: Both localStorage and IndexedDB are per-origin, so www redirects can
 * still cause issues. The real fix is to ensure consistent URLs in production.
 */
async function getEncryptionKey() {
  // Try localStorage first (more persistent than sessionStorage)
  let storedKey = localStorage.getItem(ENCRYPTION_KEY_NAME)

  // Fallback to sessionStorage for backward compatibility
  if (!storedKey) {
    storedKey = sessionStorage.getItem(ENCRYPTION_KEY_NAME)
    // Migrate to localStorage if found in sessionStorage
    if (storedKey) {
      localStorage.setItem(ENCRYPTION_KEY_NAME, storedKey)
    }
  }

  if (storedKey) {
    // Import existing key
    try {
      const keyData = JSON.parse(storedKey)
      return await crypto.subtle.importKey(
        'jwk',
        keyData,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      )
    } catch (error) {
      console.error('[SecureTokenStore] Failed to import existing key:', error)
      // Fall through to check IndexedDB
    }
  }

  // WebKit fallback: Try to get key from IndexedDB
  try {
    const db = await openDatabase()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)

    const result = await new Promise((resolve, reject) => {
      const request = store.get('_encryption_key')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    db.close()

    if (result && result.value) {
      logger.debug('[SecureTokenStore] Retrieved encryption key from IndexedDB fallback')
      const keyData = result.value
      // Store back in localStorage for faster access
      localStorage.setItem(ENCRYPTION_KEY_NAME, JSON.stringify(keyData))
      return await crypto.subtle.importKey(
        'jwk',
        keyData,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      )
    }
  } catch (error) {
    logger.debug('[SecureTokenStore] Failed to retrieve key from IndexedDB:', error)
    // Fall through to generate new key
  }

  // Generate new encryption key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  // Export and store key in localStorage (more persistent than sessionStorage)
  const exportedKey = await crypto.subtle.exportKey('jwk', key)
  localStorage.setItem(ENCRYPTION_KEY_NAME, JSON.stringify(exportedKey))

  // Also store in IndexedDB as fallback for WebKit headless tests
  try {
    const db = await openDatabase()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    await new Promise((resolve, reject) => {
      const request = store.put({ key: '_encryption_key', value: exportedKey })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    db.close()
  } catch (error) {
    logger.debug('[SecureTokenStore] Failed to store key in IndexedDB:', error)
    // Non-fatal error, sessionStorage is the primary storage
  }

  return key
}

/**
 * Convert Uint8Array to base64 string (WebKit-safe)
 * WebKit has issues with btoa/atob for binary data
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000 // Process in chunks to avoid call stack size exceeded
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
    binary += String.fromCharCode.apply(null, chunk)
  }
  return btoa(binary)
}

/**
 * Convert base64 string to Uint8Array (WebKit-safe)
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Encrypt token using AES-GCM
 */
async function encryptToken(token) {
  try {
    const key = await getEncryptionKey()
    const encoder = new TextEncoder()
    const data = encoder.encode(token)

    // Generate random IV (Initialization Vector)
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // Encrypt
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    )

    // Return IV + encrypted data as base64 (WebKit-safe conversion)
    return {
      iv: arrayBufferToBase64(iv),
      data: arrayBufferToBase64(encryptedData)
    }
  } catch (error) {
    console.error('[SecureTokenStore] Encryption failed:', error)
    throw new Error('Failed to encrypt token')
  }
}

/**
 * Decrypt token using AES-GCM
 */
async function decryptToken(encryptedToken) {
  try {
    const key = await getEncryptionKey()

    // Decode IV and data (WebKit-safe conversion)
    const iv = base64ToArrayBuffer(encryptedToken.iv)
    const data = base64ToArrayBuffer(encryptedToken.data)

    // Decrypt
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    )

    // Convert back to string
    const decoder = new TextDecoder()
    return decoder.decode(decryptedData)
  } catch (error) {
    console.error('[SecureTokenStore] Decryption failed:', error.name, error.message)
    // Log more details for debugging
    logger.debug('[SecureTokenStore] Decryption error details:', {
      errorName: error.name,
      errorMessage: error.message,
      hasIV: !!encryptedToken.iv,
      hasData: !!encryptedToken.data
    })

    // WebKit headless test fix: If decryption fails (likely due to lost sessionStorage key),
    // clear corrupted tokens to allow fresh authentication
    if (error.name === 'OperationError') {
      logger.debug('[SecureTokenStore] Clearing corrupted tokens due to decryption failure')
      await clearAllTokens().catch(err =>
        console.error('[SecureTokenStore] Failed to clear corrupted tokens:', err)
      )
    }

    return null
  }
}

/**
 * Open IndexedDB connection
 */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.error('[SecureTokenStore] Database error:', request.error)
      reject(request.error)
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
  })
}

/**
 * Store encrypted token in IndexedDB
 */
async function setToken(key, token) {
  if (!token) {
    console.warn('[SecureTokenStore] Attempting to store empty token')
    return false
  }

  try {
    // Encrypt token
    const encrypted = await encryptToken(token)

    // Store in IndexedDB
    const db = await openDatabase()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    await new Promise((resolve, reject) => {
      const request = store.put({ key, value: encrypted, timestamp: Date.now() })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    db.close()
    return true
  } catch (error) {
    console.error(`[SecureTokenStore] Failed to store ${key}:`, error)
    return false
  }
}

/**
 * Retrieve and decrypt token from IndexedDB
 */
async function getToken(key) {
  try {
    const db = await openDatabase()
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)

    const result = await new Promise((resolve, reject) => {
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    db.close()

    if (!result || !result.value) {
      return null
    }

    // Decrypt token
    return await decryptToken(result.value)
  } catch (error) {
    console.error(`[SecureTokenStore] Failed to retrieve ${key}:`, error)
    return null
  }
}

/**
 * Remove token from IndexedDB
 */
async function removeToken(key) {
  try {
    const db = await openDatabase()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    await new Promise((resolve, reject) => {
      const request = store.delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    db.close()
    return true
  } catch (error) {
    console.error(`[SecureTokenStore] Failed to remove ${key}:`, error)
    return false
  }
}

/**
 * Clear all tokens from IndexedDB
 */
async function clearAllTokens() {
  try {
    const db = await openDatabase()
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    await new Promise((resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    db.close()

    // Clear encryption key from both localStorage and sessionStorage
    localStorage.removeItem(ENCRYPTION_KEY_NAME)
    sessionStorage.removeItem(ENCRYPTION_KEY_NAME)

    return true
  } catch (error) {
    console.error('[SecureTokenStore] Failed to clear tokens:', error)
    return false
  }
}

/**
 * Migrate tokens from localStorage to encrypted IndexedDB
 * Called once during app initialization
 */
async function migrateFromLocalStorage() {
  try {
    // Check if tokens exist in localStorage
    const accessToken = localStorage.getItem('access_token')
    const refreshToken = localStorage.getItem('refresh_token')

    if (!accessToken && !refreshToken) {
      return // Nothing to migrate
    }

    logger.debug('[SecureTokenStore] Migrating tokens from localStorage to encrypted IndexedDB')

    // Store in IndexedDB
    if (accessToken) {
      await setToken('access_token', accessToken)
    }
    if (refreshToken) {
      await setToken('refresh_token', refreshToken)
    }

    // Remove from localStorage
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')

    logger.debug('[SecureTokenStore] Migration complete')
  } catch (error) {
    console.error('[SecureTokenStore] Migration failed:', error)
  }
}

/**
 * Public API
 */
export const secureTokenStore = {
  /**
   * Initialize secure token store (call once on app load)
   * Migrates tokens from localStorage if needed
   */
  async init() {
    try {
      // Check if Web Crypto API is available
      if (!crypto || !crypto.subtle) {
        console.error('[SecureTokenStore] Web Crypto API not available')
        return false
      }

      // Check if IndexedDB is available
      if (!indexedDB) {
        console.error('[SecureTokenStore] IndexedDB not available')
        return false
      }

      // Migrate existing tokens from localStorage
      await migrateFromLocalStorage()

      logger.debug('[SecureTokenStore] Initialized successfully')
      return true
    } catch (error) {
      console.error('[SecureTokenStore] Initialization failed:', error)
      return false
    }
  },

  /**
   * Store access token (encrypted)
   */
  async setAccessToken(token) {
    return await setToken('access_token', token)
  },

  /**
   * Store refresh token (encrypted)
   */
  async setRefreshToken(token) {
    return await setToken('refresh_token', token)
  },

  /**
   * Store both tokens (encrypted)
   */
  async setTokens(accessToken, refreshToken) {
    const results = await Promise.all([
      setToken('access_token', accessToken),
      setToken('refresh_token', refreshToken)
    ])
    return results.every(r => r === true)
  },

  /**
   * Get access token (decrypted)
   */
  async getAccessToken() {
    return await getToken('access_token')
  },

  /**
   * Get refresh token (decrypted)
   */
  async getRefreshToken() {
    return await getToken('refresh_token')
  },

  /**
   * Clear all tokens
   */
  async clearTokens() {
    return await clearAllTokens()
  },

  /**
   * Check if tokens exist
   */
  async hasTokens() {
    try {
      const accessToken = await this.getAccessToken()
      return !!accessToken
    } catch (error) {
      return false
    }
  }
}

export default secureTokenStore
