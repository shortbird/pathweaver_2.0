/**
 * Upload queue failure handling (ticket d3b9ef5a).
 *
 * The queue retried every error. A photo the safety screen refused
 * (400 SAFETY_CONTACT, "That image shows a phone number...") was re-sent five
 * times over four days, then dropped under a toast that called it a video, and
 * reported to Sentry. A 4xx (other than 408/429) is now final: the job is
 * dropped at once, its files are deleted, the person sees the server's safety
 * sentence (or a generic line naming the right media), and nothing goes to
 * Sentry. Network / timeout / 5xx still retry and report after MAX_ATTEMPTS.
 */

import { Platform } from 'react-native';
import { uploadViaSignedUrl } from '@/src/services/signedUpload';
import { captureException } from '@/src/services/sentry';
import { toast } from '@/src/stores/toastStore';
import {
  enqueueUpload,
  failureMessage,
  isPermanentFailure,
  mediaNoun,
  processUploadQueue,
  type QueuedMediaItem,
} from '@/src/services/uploadQueue';

// In-memory stand-in for the persistent queue directory.
const mockFiles = new Map<string, string>();
const mockDeleted: string[] = [];

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(async (p: string) => ({ exists: mockFiles.has(p) })),
  readAsStringAsync: jest.fn(async (p: string) => mockFiles.get(p) ?? ''),
  writeAsStringAsync: jest.fn(async (p: string, s: string) => { mockFiles.set(p, s); }),
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async (p: string) => { mockDeleted.push(p); }),
}), { virtual: true });

jest.mock('@/src/services/signedUpload', () => ({
  uploadViaSignedUrl: jest.fn(),
}));

jest.mock('@/src/services/api', () => ({
  __esModule: true,
  default: { post: jest.fn().mockResolvedValue({ data: {} }) },
}));

jest.mock('@/src/services/sentry', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

jest.mock('@/src/stores/toastStore', () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));


const MANIFEST = 'file:///docs/upload-queue/manifest.json';
const SAFETY_SENTENCE =
  'That image shows a phone number. Cover or crop it out and upload it again.';

const upload = uploadViaSignedUrl as jest.Mock;
const capture = captureException as jest.Mock;
const toastError = toast.error as jest.Mock;

function httpError(status: number, data: Record<string, unknown> = {}) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

function networkError() {
  return Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });
}

const image: QueuedMediaItem = { uri: 'file:///tmp/a.jpg', type: 'image', name: 'a.jpg', fileSize: 10 };
const video: QueuedMediaItem = { uri: 'file:///tmp/b.mp4', type: 'video', name: 'b.mp4', fileSize: 10 };

function manifest(): { id: string; attempts: number }[] {
  const raw = mockFiles.get(MANIFEST);
  return raw ? JSON.parse(raw) : [];
}

/** enqueueUpload kicks the processor without awaiting it; let it settle. */
async function settle() {
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
}

beforeAll(() => {
  // The queue only persists on native.
  expect(Platform.OS).not.toBe('web');
});

beforeEach(() => {
  mockFiles.clear();
  mockDeleted.length = 0;
  jest.clearAllMocks();
});

describe('isPermanentFailure (ticket d3b9ef5a)', () => {
  it.each([400, 403, 404, 413, 422])('treats %s as final', (status) => {
    expect(isPermanentFailure(httpError(status))).toBe(true);
  });

  it.each([408, 429, 500, 502, 503])('retries %s', (status) => {
    expect(isPermanentFailure(httpError(status))).toBe(false);
  });

  it('retries a network error and a plain Error', () => {
    expect(isPermanentFailure(networkError())).toBe(false);
    expect(isPermanentFailure(new Error('file size is 0'))).toBe(false);
  });
});

describe('failure wording (ticket d3b9ef5a)', () => {
  it('names the media type instead of always saying video', () => {
    expect(mediaNoun([image])).toBe('A photo');
    expect(mediaNoun([video])).toBe('A video');
    expect(mediaNoun([{ ...image, type: 'audio' }])).toBe('A voice recording');
    expect(mediaNoun([{ ...image, type: 'document' }])).toBe('A document');
    expect(mediaNoun([image, video])).toBe('Some media');
  });

  it('shows the server sentence for a SAFETY_* refusal', () => {
    const e = httpError(400, { error: SAFETY_SENTENCE, error_code: 'SAFETY_CONTACT' });
    expect(failureMessage(e, [image], true)).toBe(SAFETY_SENTENCE);
  });

  it('does not show the server text for a non-safety 4xx', () => {
    const e = httpError(400, { error: 'storage_path mismatch', error_code: 'REJECTED' });
    expect(failureMessage(e, [image], true)).toBe(
      "A photo couldn't be uploaded. Open the moment and add it again.",
    );
  });

  it('says "after several tries" only for a give-up on a retryable error', () => {
    expect(failureMessage(networkError(), [video], false)).toBe(
      "A video couldn't be uploaded after several tries. Open the moment and add it again.",
    );
  });
});

describe('processUploadQueue (ticket d3b9ef5a)', () => {
  it('drops a safety-refused job at once, deletes its files, shows the sentence, and does not report', async () => {
    upload.mockRejectedValue(httpError(400, { error: SAFETY_SENTENCE, error_code: 'SAFETY_CONTACT' }));

    await enqueueUpload({ eventId: 'evt-1', items: [image] });
    await settle();
    await processUploadQueue();

    expect(upload).toHaveBeenCalledTimes(1);
    expect(manifest()).toEqual([]);
    expect(mockDeleted.some((p) => p.startsWith('file:///docs/upload-queue/evt-1-'))).toBe(true);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(SAFETY_SENTENCE, { title: 'Upload failed' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('drops any other 4xx at once with a generic message for the media type', async () => {
    upload.mockRejectedValue(httpError(413, { error: 'too big', error_code: 'FILE_TOO_LARGE' }));

    await enqueueUpload({ eventId: 'evt-2', items: [video] });
    await settle();

    expect(manifest()).toEqual([]);
    expect(toastError).toHaveBeenCalledWith(
      "A video couldn't be uploaded. Open the moment and add it again.",
      { title: 'Upload failed' },
    );
    expect(capture).not.toHaveBeenCalled();
  });

  it.each([
    ['a network error', networkError()],
    ['a 500', httpError(500)],
    ['a 429', httpError(429)],
  ])('keeps retrying %s, then gives up and reports after MAX_ATTEMPTS', async (_label, err) => {
    upload.mockRejectedValue(err);

    await enqueueUpload({ eventId: 'evt-3', items: [image] });
    await settle();
    expect(manifest()).toHaveLength(1);
    expect(manifest()[0].attempts).toBe(1);
    expect(toastError).not.toHaveBeenCalled();

    for (let i = 0; i < 3; i += 1) await processUploadQueue();
    expect(manifest()[0].attempts).toBe(4);
    expect(capture).not.toHaveBeenCalled();

    await processUploadQueue();
    expect(manifest()).toEqual([]);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][1]).toMatchObject({ stage: 'upload-queue-gave-up' });
    expect(toastError).toHaveBeenCalledWith(
      "A photo couldn't be uploaded after several tries. Open the moment and add it again.",
      { title: 'Upload failed' },
    );
  });
});
