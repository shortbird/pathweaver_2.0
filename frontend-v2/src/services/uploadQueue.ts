/**
 * Persistent media upload queue.
 *
 * Capture is optimistic: the learning moment is created immediately, then its
 * media uploads in the background. The old flow ran that upload as a
 * fire-and-forget promise tied to the CaptureSheet's lifecycle and held the
 * file in the OS cache dir — so if the app was killed, backgrounded too long,
 * or the network blipped, a video "uploaded but never attached" and the moment
 * stayed empty with no retry (the video-attach reliability reports).
 *
 * This queue makes the upload durable:
 *  1. enqueue COPIES each media file into documentDirectory (survives app kill /
 *     OS cache eviction) and records the job in a JSON manifest.
 *  2. processQueue() runs the upload+attach worker for each pending job and only
 *     removes a job (and its files) once it fully succeeds; failures are retried
 *     on the next trigger (app start / foreground) with a bounded attempt count.
 *
 * Web has no persistent FileSystem and browser tabs aren't killed the same way,
 * so there we just run the worker inline (no copy / no manifest).
 */

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import api from './api';
import { uploadViaSignedUrl } from './signedUpload';
import { useMediaUploadStore } from '../stores/mediaUploadStore';
import { captureException } from './sentry';
import { toast } from '../stores/toastStore';

export type QueuedMediaType = 'image' | 'video' | 'audio' | 'document';

export interface QueuedMediaItem {
  uri: string;
  type: QueuedMediaType;
  name: string;
  fileSize?: number;
  durationMs?: number;
}

interface UploadJob {
  id: string;
  eventId: string;
  studentId?: string;
  items: QueuedMediaItem[];
  attempts: number;
  createdAt: number;
}

const MAX_ATTEMPTS = 5;

// Screens (feed/journal) register here to refetch when an upload finishes, so
// the real media replaces the "Uploading…" placeholder without a manual pull.
const completeListeners = new Set<() => void>();
export function onUploadComplete(cb: () => void): () => void {
  completeListeners.add(cb);
  return () => completeListeners.delete(cb);
}
function notifyComplete() {
  completeListeners.forEach((cb) => {
    try { cb(); } catch { /* listener error must not break the queue */ }
  });
}

// Reactive pending-job count, for a status pill. Kept in memory and emitted
// whenever the manifest changes (enqueue / success / give-up).
let pendingCount = 0;
const countListeners = new Set<(n: number) => void>();
function setPendingCount(n: number) {
  pendingCount = n;
  countListeners.forEach((cb) => {
    try { cb(n); } catch { /* listener error must not break the queue */ }
  });
}
export function onPendingUploadCountChange(cb: (n: number) => void): () => void {
  countListeners.add(cb);
  cb(pendingCount);
  return () => countListeners.delete(cb);
}
/** React hook: the number of media uploads still pending. */
export function usePendingUploadCount(): number {
  const [n, setN] = useState(pendingCount);
  useEffect(() => onPendingUploadCountChange(setN), []);
  return n;
}

// Lazy legacy FileSystem (the v55 top-level module dropped copyAsync etc.).
// Mirrors src/services/signedUpload.ts. Null on web / if unavailable.
let FileSystem: typeof import('expo-file-system/legacy') | null = null;
try {
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    FileSystem = require('expo-file-system/legacy');
  }
} catch {
  FileSystem = null;
}

const persistent = !!FileSystem && Platform.OS !== 'web';
const QUEUE_DIR = persistent ? `${FileSystem!.documentDirectory}upload-queue/` : '';
const MANIFEST = `${QUEUE_DIR}manifest.json`;

let genCounter = 0;
function genId(eventId: string): string {
  genCounter += 1;
  return `${eventId}-${Date.now()}-${genCounter}`;
}

function sanitize(name: string): string {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}

// ── Manifest persistence ──────────────────────────────────────────────────

async function readManifest(): Promise<UploadJob[]> {
  if (!persistent) return [];
  try {
    const info = await FileSystem!.getInfoAsync(MANIFEST);
    if (!info.exists) return [];
    const raw = await FileSystem!.readAsStringAsync(MANIFEST);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeManifest(jobs: UploadJob[]): Promise<void> {
  if (!persistent) return;
  try {
    await FileSystem!.makeDirectoryAsync(QUEUE_DIR, { intermediates: true }).catch(() => {});
    await FileSystem!.writeAsStringAsync(MANIFEST, JSON.stringify(jobs));
  } catch (e) {
    captureException(e, { stage: 'upload-queue-write-manifest' });
  }
  setPendingCount(jobs.length);
}

async function deleteJobFiles(jobId: string): Promise<void> {
  if (!persistent) return;
  try {
    await FileSystem!.deleteAsync(`${QUEUE_DIR}${jobId}/`, { idempotent: true });
  } catch {
    // best-effort cleanup
  }
}

// ── The worker: upload every item, then attach the evidence blocks ─────────

function mimeForType(t: QueuedMediaType): string {
  if (t === 'video') return 'video/mp4';
  if (t === 'audio') return 'audio/m4a';
  if (t === 'document') return 'application/pdf';
  return 'image/jpeg';
}
function fallbackExt(t: QueuedMediaType): string {
  return t === 'image' ? 'jpg' : t === 'video' ? 'mp4' : t === 'document' ? 'pdf' : 'm4a';
}

/**
 * Upload all of a job's media and attach them to the moment. Throws on any
 * failure so the queue keeps the job for a later retry. Idempotent on the
 * backend side: the evidence endpoint replaces a moment's blocks, so a retry
 * after a partial failure re-uploads and re-attaches cleanly.
 */
async function runJob(job: { eventId: string; studentId?: string; items: QueuedMediaItem[] }): Promise<void> {
  const { eventId, studentId, items } = job;
  const initPath = studentId
    ? `/api/parent/children/${studentId}/learning-moments/${eventId}/upload-init`
    : `/api/learning-events/${eventId}/upload-init`;
  const finalizePath = studentId
    ? `/api/parent/children/${studentId}/learning-moments/${eventId}/upload-finalize`
    : `/api/learning-events/${eventId}/upload-finalize`;
  const evidencePath = studentId
    ? `/api/parent/children/${studentId}/learning-moments/${eventId}/evidence`
    : `/api/learning-events/${eventId}/evidence`;

  const hasVideo = items.some((it) => it.type === 'video');
  const store = useMediaUploadStore.getState();
  if (hasVideo) store.start(eventId);
  const itemPct = new Array(items.length).fill(0);
  const reportProgress = (index: number, pct: number) => {
    itemPct[index] = pct;
    store.setProgress(eventId, Math.round(itemPct.reduce((a, b) => a + b, 0) / itemPct.length));
  };

  try {
    const blocks: Array<Record<string, unknown>> = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const filename = item.name || item.uri.split('/').pop() || `capture.${fallbackExt(item.type)}`;
      const result = await uploadViaSignedUrl({
        file: { uri: item.uri, name: filename, type: mimeForType(item.type), size: item.fileSize ?? 0 },
        initPath,
        finalizePath,
        blockType: item.type,
        onProgress: hasVideo ? (pct) => reportProgress(index, pct) : undefined,
      });
      blocks.push({
        block_type: item.type,
        content: item.type === 'audio' && item.durationMs ? { duration_ms: item.durationMs } : {},
        file_url: (result.file_url || result.url) as string,
        file_name: (result.filename || result.file_name || filename) as string,
        order_index: index,
      });
    }
    if (blocks.length > 0) {
      await api.post(evidencePath, { blocks });
      notifyComplete();
    }
  } finally {
    if (hasVideo) store.finish(eventId);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

let processing = false;

/**
 * Queue a moment's media for durable upload. On native the files are copied to
 * persistent storage and recorded in the manifest before this resolves, so the
 * upload survives an immediate app kill. On web it runs inline (no persistence).
 */
export async function enqueueUpload(args: {
  eventId: string;
  studentId?: string;
  items: QueuedMediaItem[];
}): Promise<void> {
  if (!args.items.length) return;

  if (!persistent) {
    // Web / no FileSystem: run inline, surface terminal failures.
    runJob(args).catch((e) => {
      captureException(e, { stage: 'upload-queue-inline', extra: { eventId: args.eventId } });
      toast.error('Some media couldn\'t be uploaded. Open the moment to try again.', { title: 'Upload failed' });
    });
    return;
  }

  const jobId = genId(args.eventId);
  const jobDir = `${QUEUE_DIR}${jobId}/`;
  try {
    await FileSystem!.makeDirectoryAsync(jobDir, { intermediates: true }).catch(() => {});
    // Copy each media file into persistent storage so it survives an app kill.
    const persistedItems: QueuedMediaItem[] = [];
    for (let i = 0; i < args.items.length; i += 1) {
      const item = args.items[i];
      const dest = `${jobDir}${i}_${sanitize(item.name)}`;
      try {
        await FileSystem!.copyAsync({ from: item.uri, to: dest });
        persistedItems.push({ ...item, uri: dest });
      } catch {
        // If a copy fails (file already gone), fall back to the original uri —
        // it may still upload this session even if it won't survive a restart.
        persistedItems.push({ ...item });
      }
    }
    const jobs = await readManifest();
    jobs.push({
      id: jobId,
      eventId: args.eventId,
      studentId: args.studentId,
      items: persistedItems,
      attempts: 0,
      createdAt: Date.now(),
    });
    await writeManifest(jobs);
  } catch (e) {
    captureException(e, { stage: 'upload-queue-enqueue', extra: { eventId: args.eventId } });
    // Fall back to a best-effort inline upload so we don't drop the media.
    runJob(args).catch((err) => captureException(err, { stage: 'upload-queue-enqueue-fallback' }));
    return;
  }

  // Kick the processor (don't await — caller's UI is already free).
  void processUploadQueue();
}

/**
 * Process every pending job in the queue. Safe to call repeatedly (re-entrancy
 * guarded). Removes a job only once it fully succeeds; otherwise increments its
 * attempt count and keeps it for the next trigger, dropping it after
 * MAX_ATTEMPTS with a user-visible toast.
 */
export async function processUploadQueue(): Promise<void> {
  if (!persistent || processing) return;
  processing = true;
  try {
    let jobs = await readManifest();
    setPendingCount(jobs.length);
    if (!jobs.length) return;

    for (const job of jobs) {
      try {
        await runJob(job);
        // Success — drop the job + its files, persist the shrunk manifest.
        jobs = (await readManifest()).filter((j) => j.id !== job.id);
        await writeManifest(jobs);
        await deleteJobFiles(job.id);
      } catch (e) {
        const current = await readManifest();
        const idx = current.findIndex((j) => j.id === job.id);
        if (idx === -1) continue;
        current[idx].attempts += 1;
        if (current[idx].attempts >= MAX_ATTEMPTS) {
          captureException(e, {
            stage: 'upload-queue-gave-up',
            extra: { eventId: job.eventId, attempts: current[idx].attempts },
          });
          toast.error(
            'A video couldn\'t be uploaded after several tries. Open the moment and add it again.',
            { title: 'Upload failed' },
          );
          const remaining = current.filter((j) => j.id !== job.id);
          await writeManifest(remaining);
          await deleteJobFiles(job.id);
        } else {
          await writeManifest(current);
          // Stop this pass; the next trigger (foreground/app-start) retries.
        }
      }
    }
  } finally {
    processing = false;
  }
}

/** Number of uploads still pending (for an optional status indicator). */
export async function getPendingUploadCount(): Promise<number> {
  if (!persistent) return 0;
  return (await readManifest()).length;
}
