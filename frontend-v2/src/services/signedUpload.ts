/**
 * Signed-upload helper (v2) — universal (web + native mobile).
 *
 * Flow:
 *   1. POST {initPath} with { filename, file_size, content_type?, block_type? }
 *      -> backend returns { signed_url, token, storage_path, bucket, ... }
 *   2. PUT file to signed_url directly. On native we use XHR with a ReactNative
 *      file descriptor ({ uri, name, type }); on web we use XHR with a Blob/File.
 *   3. POST {finalizePath} with { storage_path, bucket, block_type? }
 *      -> backend verifies and runs post-processing; returns URL + metadata.
 *
 * The PUT leg is single-shot (Supabase signed upload URLs are one-shot); on
 * failure we request a fresh signed URL and start over, up to `maxAttempts`.
 */

import { Platform } from 'react-native';
import { api } from './api';

const DEFAULT_MAX_ATTEMPTS = 3;

/** Native (expo-image-picker) emits files of this shape. Web uses File/Blob. */
export type UploadFile =
  | File
  | Blob
  | {
      uri: string;
      name: string;
      type?: string;
      size?: number;
    };

export interface UploadViaSignedUrlArgs {
  file: UploadFile;
  initPath: string;
  finalizePath: string;
  blockType?: 'image' | 'video' | 'document' | 'audio';
  extraInitBody?: Record<string, unknown>;
  extraFinalizeBody?: Record<string, unknown>;
  onProgress?: (pct: number) => void;
  maxAttempts?: number;
}

export interface SignedUploadResult {
  url?: string;
  file_url?: string;
  filename?: string;
  file_name?: string;
  file_size?: number;
  content_type?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  width?: number;
  height?: number;
  [k: string]: unknown;
}

function fileDescriptor(file: UploadFile): { name: string; size: number; type: string } {
  if (typeof File !== 'undefined' && file instanceof File) {
    return { name: file.name, size: file.size, type: file.type || 'application/octet-stream' };
  }
  const f = file as { uri?: string; name?: string; size?: number; type?: string };
  return {
    name: f.name || 'upload',
    size: f.size || 0,
    type: f.type || 'application/octet-stream',
  };
}

export async function uploadViaSignedUrl({
  file,
  initPath,
  finalizePath,
  blockType,
  extraInitBody,
  extraFinalizeBody,
  onProgress,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}: UploadViaSignedUrlArgs): Promise<SignedUploadResult> {
  if (!file) throw new Error('file required');
  if (!initPath) throw new Error('initPath required');
  if (!finalizePath) throw new Error('finalizePath required');

  const descriptor = fileDescriptor(file);

  // Native: normalize photo-library URIs and backfill a missing size BEFORE the
  // size-0 pre-flight guard. On iOS the picker can hand back a `ph://` asset
  // (unreadable by the upload transport → empty body) and/or omit `fileSize`
  // for library videos/HEIC. Either one would previously drop the file —
  // `ph://` uploaded 0 bytes, and a missing size tripped the guard below and was
  // silently swallowed by the caller. This was the "photos disappear on iPhone"
  // bug (Sentry NODE-A).
  let uploadFile = file;
  let cleanupNative: () => Promise<void> = async () => {};
  if (Platform.OS !== 'web') {
    const prep = await prepareNativeUpload(file, descriptor);
    if (prep.uri) {
      uploadFile = { ...(file as object), uri: prep.uri } as UploadFile;
    }
    cleanupNative = prep.cleanup;
  }

  try {
    if (!descriptor.size) {
      throw new Error('file size is 0 — upload would fail pre-flight');
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const initResp = await api.post(initPath, {
          filename: descriptor.name,
          file_size: descriptor.size,
          content_type: descriptor.type,
          block_type: blockType,
          ...(extraInitBody || {}),
        });
        const upload = initResp.data?.upload;
        if (!upload?.signed_url || !upload?.storage_path || !upload?.bucket) {
          throw new Error('Invalid upload session response');
        }

        await putToSignedUrl({
          signedUrl: upload.signed_url,
          file: uploadFile,
          descriptor,
          onProgress,
        });

        const finalizeResp = await api.post(finalizePath, {
          storage_path: upload.storage_path,
          bucket: upload.bucket,
          block_type: blockType || upload.media_type,
          ...(extraFinalizeBody || {}),
        });
        return finalizeResp.data as SignedUploadResult;
      } catch (err) {
        lastError = err;
        const status = (err as { response?: { status?: number } })?.response?.status;
        // Pre-flight rejection (4xx except timeout) — no retry.
        if (status && status >= 400 && status < 500 && status !== 408) {
          throw err;
        }
        if (attempt === maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
    throw lastError;
  } finally {
    await cleanupNative();
  }
}

// expo-file-system has no web build; lazy-require so the web bundle isn't
// affected when we never reach the native branch.
//
// SDK 55 moved the upload primitives (`createUploadTask`, `uploadAsync`,
// `FileSystemUploadType`) into the `legacy` subpath; the top-level module
// is the new file-system API which doesn't expose them. We import from the
// legacy subpath specifically for upload functionality — that's still the
// supported way to get background-tolerant uploads in this SDK.
let FileSystem: typeof import('expo-file-system/legacy') | null = null;
if (Platform.OS !== 'web') {
  try {
    FileSystem = require('expo-file-system/legacy');
  } catch {
    FileSystem = null;
  }
}

/**
 * Make a native picker file safe to upload:
 *  - Copy iOS photo-library URIs (`ph://`, `assets-library://`) into the app
 *    cache, because the upload transport reads them as an empty body otherwise.
 *  - Backfill `descriptor.size` from the readable file when the picker omitted
 *    it, so a valid file isn't rejected by the size-0 pre-flight guard.
 * Returns the (possibly copied) uri plus a best-effort cleanup for the copy.
 */
async function prepareNativeUpload(
  file: UploadFile,
  descriptor: { name: string; size: number; type: string },
): Promise<{ uri: string; cleanup: () => Promise<void> }> {
  const noCleanup = async () => {};
  const rawUri = (file as { uri?: string }).uri;
  if (!rawUri) return { uri: '', cleanup: noCleanup };

  const isPhotoLibraryUri = /^(ph|assets-library):\/\//i.test(rawUri);

  if (!FileSystem) {
    // Without expo-file-system we can neither copy nor probe. A plain file:// /
    // content:// uri still uploads fine; a photo-library uri cannot be read, so
    // fail loudly rather than persist an empty object.
    if (isPhotoLibraryUri) {
      throw new Error('Cannot read photo-library asset (expo-file-system unavailable)');
    }
    return { uri: rawUri, cleanup: noCleanup };
  }

  let uri = rawUri;
  let cleanup = noCleanup;

  if (isPhotoLibraryUri) {
    const dir = (FileSystem.cacheDirectory || FileSystem.documentDirectory || '') + 'optio-uploads/';
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const safeName = (descriptor.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    const dest = `${dir}${Date.now()}_${safeName}`;
    await FileSystem.copyAsync({ from: rawUri, to: dest });
    uri = dest;
    cleanup = async () => {
      try {
        await FileSystem!.deleteAsync(dest, { idempotent: true });
      } catch {
        // best-effort temp cleanup
      }
    };
  }

  if (!descriptor.size) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && typeof (info as { size?: number }).size === 'number') {
        descriptor.size = (info as { size: number }).size;
      }
    } catch {
      // leave size unset; the pre-flight guard catches a genuinely unreadable file
    }
  }

  return { uri, cleanup };
}

function putToSignedUrl({
  signedUrl,
  file,
  descriptor,
  onProgress,
}: {
  signedUrl: string;
  file: UploadFile;
  descriptor: { name: string; size: number; type: string };
  onProgress?: (pct: number) => void;
}): Promise<void> {
  // Native path: use expo-file-system's upload task. Unlike XHR, this task
  // survives the OS suspending the JS bridge while the app is backgrounded,
  // which is the realistic failure mode for parents uploading a long video
  // and then locking their phone. Falls back to XHR if the native module
  // isn't present in this dev client.
  if (Platform.OS !== 'web' && FileSystem) {
    const localUri = (file as { uri: string }).uri;
    if (!localUri) {
      return Promise.reject(new Error('Native upload requires a file uri'));
    }
    return uploadViaFileSystem({ signedUrl, localUri, descriptor, onProgress });
  }
  return uploadViaXhr({ signedUrl, file, descriptor, onProgress });
}

function uploadViaFileSystem({
  signedUrl,
  localUri,
  descriptor,
  onProgress,
}: {
  signedUrl: string;
  localUri: string;
  descriptor: { name: string; size: number; type: string };
  onProgress?: (pct: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!FileSystem) {
      reject(new Error('expo-file-system unavailable'));
      return;
    }
    // Match the XHR multipart payload exactly so Supabase signed URLs accept
    // either path interchangeably. Field name "file" matches the XHR branch.
    const task = FileSystem.createUploadTask(
      signedUrl,
      localUri,
      {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: descriptor.type,
        parameters: {},
      },
      (progress) => {
        if (onProgress && progress.totalBytesExpectedToSend > 0) {
          onProgress(
            Math.round((progress.totalBytesSent * 100) / progress.totalBytesExpectedToSend),
          );
        }
      },
    );
    task
      .uploadAsync()
      .then((res: { status: number; body?: string } | null | undefined) => {
        if (!res) {
          reject(new Error('Upload returned no response'));
          return;
        }
        if (res.status >= 200 && res.status < 300) {
          resolve();
        } else {
          const err = new Error(
            `Storage upload failed (HTTP ${res.status}): ${(res.body || '').slice(0, 200)}`,
          );
          (err as { status?: number }).status = res.status;
          reject(err);
        }
      })
      .catch((err: unknown) => reject(err instanceof Error ? err : new Error(String(err))));
  });
}

function uploadViaXhr({
  signedUrl,
  file,
  descriptor,
  onProgress,
}: {
  signedUrl: string;
  file: UploadFile;
  descriptor: { name: string; size: number; type: string };
  onProgress?: (pct: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    if (Platform.OS === 'web') {
      formData.append('file', file as Blob, descriptor.name);
    } else {
      formData.append('file', {
        uri: (file as { uri: string }).uri,
        name: descriptor.name,
        type: descriptor.type,
      } as unknown as Blob);
    }

    xhr.open('PUT', signedUrl, true);

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable && e.total > 0) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        const err = new Error(
          `Storage upload failed (HTTP ${xhr.status}): ${xhr.responseText?.slice(0, 200) || ''}`,
        );
        (err as { status?: number }).status = xhr.status;
        reject(err);
      }
    };
    xhr.onerror = () => reject(new Error('Network error during storage upload'));
    xhr.ontimeout = () => reject(new Error('Storage upload timed out'));
    xhr.timeout = 10 * 60 * 1000;

    xhr.send(formData);
  });
}

export default uploadViaSignedUrl;
