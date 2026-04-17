import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./api', () => ({
  default: {
    post: vi.fn(),
  },
}))
vi.mock('../utils/logger', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import api from './api'
import { uploadViaSignedUrl } from './signedUpload'

/** Fake XMLHttpRequest the helper can drive synchronously. */
function installFakeXHR({ shouldFail = false, status = 200, errorKind = null } = {}) {
  const upload = { onprogress: null }
  const xhr = {
    upload,
    open: vi.fn(),
    send: vi.fn(function sendImpl() {
      queueMicrotask(() => {
        if (upload.onprogress) {
          upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 })
        }
        if (errorKind === 'error') {
          xhr.onerror && xhr.onerror()
          return
        }
        if (errorKind === 'timeout') {
          xhr.ontimeout && xhr.ontimeout()
          return
        }
        xhr.status = shouldFail ? status : 200
        xhr.responseText = shouldFail ? 'forbidden' : ''
        xhr.onload && xhr.onload()
      })
    }),
    onload: null,
    onerror: null,
    ontimeout: null,
    timeout: 0,
    status: 0,
    responseText: '',
  }
  // Must be a real (non-arrow) function so `new XMLHttpRequest()` works.
  function XHRFactory() { return xhr }
  vi.stubGlobal('XMLHttpRequest', XHRFactory)
  return xhr
}

function makeFile(name = 'photo.png', size = 2048, type = 'image/png') {
  const blob = new Blob([new Uint8Array(size)], { type })
  return new File([blob], name, { type })
}

describe('uploadViaSignedUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('performs init -> PUT -> finalize and returns the finalize response', async () => {
    api.post.mockImplementation(async (path) => {
      if (path.endsWith('/upload-init')) {
        return {
          data: {
            success: true,
            upload: {
              signed_url: 'https://supabase.invalid/upload?token=tkn',
              token: 'tkn',
              storage_path: 'evidence-tasks/u/task-1_photo.png',
              bucket: 'quest-evidence',
              media_type: 'image',
            },
          },
        }
      }
      if (path.endsWith('/upload-finalize')) {
        return {
          data: {
            success: true,
            url: 'https://supabase.invalid/public/photo.png',
            filename: 'photo.png',
            file_size: 2048,
          },
        }
      }
      throw new Error(`unexpected path: ${path}`)
    })
    installFakeXHR()

    const onProgress = vi.fn()
    const result = await uploadViaSignedUrl({
      file: makeFile(),
      initPath: '/api/evidence/documents/task-1/upload-init',
      finalizePath: '/api/evidence/documents/task-1/upload-finalize',
      blockType: 'image',
      onProgress,
    })

    expect(result.url).toContain('supabase.invalid')
    expect(result.filename).toBe('photo.png')

    // Init call included declared size + type + block_type.
    const initCall = api.post.mock.calls.find((c) => c[0].endsWith('/upload-init'))
    expect(initCall[1]).toMatchObject({
      filename: 'photo.png',
      file_size: 2048,
      content_type: 'image/png',
      block_type: 'image',
    })

    // Finalize sent the storage_path/bucket from init back to the backend.
    const finalizeCall = api.post.mock.calls.find((c) => c[0].endsWith('/upload-finalize'))
    expect(finalizeCall[1]).toMatchObject({
      storage_path: 'evidence-tasks/u/task-1_photo.png',
      bucket: 'quest-evidence',
    })

    // Progress callback fired at least once (via our fake XHR).
    expect(onProgress).toHaveBeenCalled()
  })

  it('does NOT retry on 4xx rejections from init (e.g. file too large)', async () => {
    api.post.mockImplementation(async () => {
      const err = new Error('too large')
      err.response = { status: 413, data: { error: 'too large' } }
      throw err
    })
    installFakeXHR()

    await expect(
      uploadViaSignedUrl({
        file: makeFile(),
        initPath: '/init',
        finalizePath: '/finalize',
        maxAttempts: 3,
      }),
    ).rejects.toMatchObject({ response: { status: 413 } })

    // Only one init attempt — no retry on 4xx.
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('retries on PUT network failure and succeeds on later attempt', async () => {
    let xhrCalls = 0
    // Fresh XHR per call: first fails with error, second succeeds.
    function XHRFactory() {
      xhrCalls += 1
      const upload = { onprogress: null }
      const xhr = {
        upload,
        open: vi.fn(),
        send: vi.fn(() => {
          queueMicrotask(() => {
            if (xhrCalls === 1) {
              xhr.onerror && xhr.onerror()
            } else {
              xhr.status = 200
              xhr.onload && xhr.onload()
            }
          })
        }),
        onload: null,
        onerror: null,
        ontimeout: null,
        timeout: 0,
        status: 0,
        responseText: '',
      }
      return xhr
    }
    vi.stubGlobal('XMLHttpRequest', XHRFactory)

    api.post.mockImplementation(async (path) => {
      if (path === '/init') {
        return {
          data: {
            upload: {
              signed_url: 'https://supabase.invalid/upload?token=tkn',
              storage_path: 'p',
              bucket: 'b',
            },
          },
        }
      }
      if (path === '/finalize') {
        return { data: { url: 'https://ok', filename: 'x.png', file_size: 1 } }
      }
      throw new Error(`unexpected ${path}`)
    })

    const result = await uploadViaSignedUrl({
      file: makeFile(),
      initPath: '/init',
      finalizePath: '/finalize',
      maxAttempts: 3,
    })
    expect(result.url).toBe('https://ok')
    // Two init calls (retry requests a fresh signed URL) + one finalize.
    const initCalls = api.post.mock.calls.filter((c) => c[0] === '/init').length
    expect(initCalls).toBe(2)
    expect(xhrCalls).toBe(2)
  })

  it('throws if init returns a malformed upload session', async () => {
    api.post.mockResolvedValue({ data: { upload: {} } }) // missing signed_url
    installFakeXHR()

    await expect(
      uploadViaSignedUrl({
        file: makeFile(),
        initPath: '/init',
        finalizePath: '/finalize',
        maxAttempts: 1,
      }),
    ).rejects.toThrow(/Invalid upload session/)
  })

  it('surfaces Supabase PUT errors with status', async () => {
    api.post.mockResolvedValue({
      data: {
        upload: { signed_url: 'https://x', storage_path: 'p', bucket: 'b' },
      },
    })
    installFakeXHR({ shouldFail: true, status: 400 })

    await expect(
      uploadViaSignedUrl({
        file: makeFile(),
        initPath: '/init',
        finalizePath: '/finalize',
        maxAttempts: 1,
      }),
    ).rejects.toThrow(/HTTP 400/)
  })
})
