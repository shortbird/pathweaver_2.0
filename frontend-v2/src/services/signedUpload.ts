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
  blockType?: 'image' | 'video' | 'document';
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
        file,
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
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    if (Platform.OS === 'web') {
      // Web: File/Blob is appendable directly.
      formData.append('file', file as Blob, descriptor.name);
    } else {
      // React Native: append an object with uri/name/type; RN's FormData polyfill
      // streams the file from disk without reading it into memory.
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
