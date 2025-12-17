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

const DB_NAME = 'optio_secure_storage'
const DB_VERSION = 1
const STORE_NAME = 'auth_tokens'
const ENCRYPTION_KEY_NAME = 'session_encryption_key'

/**
 * Generate or retrieve session-specific encryption key
 * Key is stored in sessionStorage (cleared on tab close)
 * This ensures tokens are only accessible during the current session
 */
async function getEncryptionKey() {
  // Try to get existing key from sessionStorage
  const storedKey = sessionStorage.getItem(ENCRYPTION_KEY_NAME)

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
      // Fall through to generate new key
    }
  }

  // Generate new encryption key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  // Export and store key in sessionStorage
  const exportedKey = await crypto.subtle.exportKey('jwk', key)
  sessionStorage.setItem(ENCRYPTION_KEY_NAME, JSON.stringify(exportedKey))

  return key
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

    // Return IV + encrypted data as base64
    return {
      iv: btoa(String.fromCharCode(...iv)),
      data: btoa(String.fromCharCode(...new Uint8Array(encryptedData)))
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

    // Decode IV and data
    const iv = new Uint8Array(atob(encryptedToken.iv).split('').map(c => c.charCodeAt(0)))
    const data = new Uint8Array(atob(encryptedToken.data).split('').map(c => c.charCodeAt(0)))

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
    console.error('[SecureTokenStore] Decryption failed:', error)
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

    // Also clear encryption key
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

    console.log('[SecureTokenStore] Migrating tokens from localStorage to encrypted IndexedDB')

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

    console.log('[SecureTokenStore] Migration complete')
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

      console.log('[SecureTokenStore] Initialized successfully')
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
