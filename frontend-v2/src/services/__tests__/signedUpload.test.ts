/**
 * Tests for the v2 signed-upload helper.
 *
 * Mocks the api client + XMLHttpRequest so we can drive the full flow
 * synchronously without a real network.
 */

jest.mock('@/src/services/api', () => ({
  api: { post: jest.fn() },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: { web?: unknown; default?: unknown }) => o.web ?? o.default },
}));

import { api } from '@/src/services/api';
import { uploadViaSignedUrl } from '@/src/services/signedUpload';

const apiPost = api.post as jest.MockedFunction<typeof api.post>;

function installFakeXHR({ shouldFail = false, status = 200, errorKind = null as string | null } = {}) {
  const upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  const xhr: Record<string, unknown> = {
    upload,
    open: jest.fn(),
    send: jest.fn(() => {
      queueMicrotask(() => {
        if (upload.onprogress) {
          upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
        }
        if (errorKind === 'error') {
          (xhr.onerror as () => void)?.();
          return;
        }
        if (errorKind === 'timeout') {
          (xhr.ontimeout as () => void)?.();
          return;
        }
        xhr.status = shouldFail ? status : 200;
        xhr.responseText = shouldFail ? 'nope' : '';
        (xhr.onload as () => void)?.();
      });
    }),
    onload: null,
    onerror: null,
    ontimeout: null,
    timeout: 0,
    status: 0,
    responseText: '',
  };
  function XHRFactory(this: unknown) {
    return xhr;
  }
  (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = XHRFactory;
  return xhr;
}

function makeWebFile(name = 'photo.png', size = 2048, type = 'image/png') {
  const blob = new Blob([new Uint8Array(size)], { type });
  // jsdom/node may not provide File — fall back to the blob with .name on it.
  try {
    return new File([blob], name, { type });
  } catch {
    (blob as unknown as { name: string }).name = name;
    return blob as unknown as File;
  }
}

describe('uploadViaSignedUrl (v2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('init -> PUT -> finalize happy path', async () => {
    apiPost.mockImplementation(async (path: string) => {
      if (path.endsWith('/upload-init')) {
        return {
          data: {
            upload: {
              signed_url: 'https://supabase.invalid/upload?token=tkn',
              token: 'tkn',
              storage_path: 'evidence-tasks/u/photo.png',
              bucket: 'quest-evidence',
              media_type: 'image',
            },
          },
        } as unknown as ReturnType<typeof apiPost>;
      }
      return {
        data: {
          url: 'https://supabase.invalid/public/photo.png',
          filename: 'photo.png',
          file_size: 2048,
        },
      } as unknown as ReturnType<typeof apiPost>;
    });
    installFakeXHR();

    const onProgress = jest.fn();
    const result = await uploadViaSignedUrl({
      file: makeWebFile(),
      initPath: '/api/evidence/documents/task-1/upload-init',
      finalizePath: '/api/evidence/documents/task-1/upload-finalize',
      blockType: 'image',
      onProgress,
    });

    expect(result.url).toContain('supabase.invalid');
    expect(onProgress).toHaveBeenCalled();

    const initBody = apiPost.mock.calls.find((c) => (c[0] as string).endsWith('/upload-init'))?.[1];
    expect(initBody).toMatchObject({
      filename: 'photo.png',
      file_size: 2048,
      content_type: 'image/png',
      block_type: 'image',
    });
  });

  it('does NOT retry on 4xx init rejection (e.g. FILE_TOO_LARGE)', async () => {
    apiPost.mockRejectedValue(
      Object.assign(new Error('too large'), { response: { status: 413, data: {} } }),
    );
    installFakeXHR();

    await expect(
      uploadViaSignedUrl({
        file: makeWebFile(),
        initPath: '/init',
        finalizePath: '/finalize',
        maxAttempts: 3,
      }),
    ).rejects.toMatchObject({ response: { status: 413 } });
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('rejects zero-byte files before any network call', async () => {
    await expect(
      uploadViaSignedUrl({
        file: { uri: 'file:///tmp/a.mp4', name: 'a.mp4', size: 0, type: 'video/mp4' },
        initPath: '/init',
        finalizePath: '/finalize',
      }),
    ).rejects.toThrow(/size is 0/);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('surfaces Supabase PUT errors with status', async () => {
    apiPost.mockResolvedValue({
      data: {
        upload: {
          signed_url: 'https://x',
          token: 't',
          storage_path: 'p',
          bucket: 'b',
        },
      },
    } as unknown as ReturnType<typeof apiPost>);
    installFakeXHR({ shouldFail: true, status: 403 });

    await expect(
      uploadViaSignedUrl({
        file: makeWebFile(),
        initPath: '/init',
        finalizePath: '/finalize',
        maxAttempts: 1,
      }),
    ).rejects.toThrow(/HTTP 403/);
  });

  it('retries PUT on network error and succeeds on attempt 2', async () => {
    // Fresh XHR per call: first errors, second succeeds.
    let calls = 0;
    function XHRFactory(this: unknown) {
      calls += 1;
      const upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
      const xhr: Record<string, unknown> = {
        upload,
        open: jest.fn(),
        send: jest.fn(() => {
          queueMicrotask(() => {
            if (calls === 1) {
              (xhr.onerror as () => void)?.();
            } else {
              xhr.status = 200;
              (xhr.onload as () => void)?.();
            }
          });
        }),
        onload: null,
        onerror: null,
        ontimeout: null,
        timeout: 0,
        status: 0,
        responseText: '',
      };
      return xhr;
    }
    (global as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = XHRFactory;

    apiPost.mockImplementation(async (path: string) => {
      if (path === '/init') {
        return {
          data: { upload: { signed_url: 'https://x', token: 't', storage_path: 'p', bucket: 'b' } },
        } as unknown as ReturnType<typeof apiPost>;
      }
      return { data: { url: 'https://ok', filename: 'x.png', file_size: 1 } } as unknown as ReturnType<typeof apiPost>;
    });

    const result = await uploadViaSignedUrl({
      file: makeWebFile(),
      initPath: '/init',
      finalizePath: '/finalize',
      maxAttempts: 3,
    });
    expect(result.url).toBe('https://ok');
    const initCalls = apiPost.mock.calls.filter((c) => c[0] === '/init').length;
    expect(initCalls).toBe(2);
    expect(calls).toBe(2);
  });
});
