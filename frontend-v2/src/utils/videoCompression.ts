/**
 * Client-side video compression for upload.
 *
 * Phones record evidence clips at whatever the camera defaults to — often
 * 1080p/4K at 30–60 fps, which is 100–300 MB for a two-minute clip. That's
 * far more fidelity than we need to *display* learning evidence, and it's
 * expensive to store (Supabase buckets cap at 500 MB and we pay per GB).
 *
 * We transcode to 720p H.264 at ~2 Mbps before upload, which lands a typical
 * two-minute clip around 25–40 MB — a ~6x storage cut with no meaningful loss
 * for playback. This mirrors the image path in `imageCompression.ts`.
 *
 * Compression uses `react-native-compressor`, a NATIVE module. It is a no-op
 * on web, and a safe no-op (returns the original asset, uploads uncompressed)
 * in any build where the native module isn't present — e.g. a dev client built
 * before this dependency was added, or the jest environment. So shipping this
 * never breaks uploads; it just doesn't shrink them until the dev client is
 * rebuilt.
 *
 * Pattern (see `compressMediaAssets` for the combined image+video helper):
 *   const compressed = await compressMediaAssets(result.assets, setPct);
 *   addMedia(compressed);
 */

import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';
import { compressImageAsset } from './imageCompression';

// 720p balanced: cap the longest edge at 1280 px (= 720p for 16:9) and target
// ~2 Mbps H.264. Enough fidelity for evidence playback, ~6x smaller than raw.
const MAX_LONG_EDGE = 1280;
const TARGET_BITRATE = 2_000_000;

// Below this, the transcode round-trip isn't worth the device time/heat — the
// file is already small enough to store as-is.
const SKIP_BELOW_BYTES = 3 * 1024 * 1024;

/**
 * Library-pick duration ceiling (5 min). Camera capture is separately capped
 * via `videoMaxDuration: 120` on `launchCameraAsync`, but gallery picks have
 * no such limit, so a 4K 20-minute clip could otherwise slip through. Callers
 * enforce this against `asset.duration` (which expo reports in milliseconds)
 * and surface the rejection to the user.
 */
export const MAX_VIDEO_DURATION_MS = 5 * 60 * 1000;

/** Lazy-require so the web bundle (and builds without the native module) don't
 *  try to load it at import time. */
function getCompressor(): typeof import('react-native-compressor') | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('react-native-compressor');
  } catch {
    return null;
  }
}

/**
 * Compress a single video asset to 720p. Returns the input unchanged if
 * compression isn't applicable (not a video, already small, native module
 * missing, or anything throws). `onProgress` receives 0–100.
 */
export async function compressVideoAsset(
  asset: ImagePickerAsset,
  onProgress?: (pct: number) => void,
): Promise<ImagePickerAsset> {
  const mod = getCompressor();
  if (!mod?.Video) return asset;
  if (asset.type !== 'video') return asset;
  if ((asset.fileSize ?? 0) > 0 && (asset.fileSize ?? 0) <= SKIP_BELOW_BYTES) return asset;

  try {
    const outUri = await mod.Video.compress(
      asset.uri,
      {
        compressionMethod: 'manual',
        maxSize: MAX_LONG_EDGE,
        bitrate: TARGET_BITRATE,
      },
      (progress) => onProgress?.(Math.round(progress * 100)),
    );
    return {
      ...asset,
      uri: outUri,
      // The transcode always re-muxes to MP4/H.264; align the filename so
      // downstream MIME sniffing stays consistent.
      fileName: (asset.fileName || 'video').replace(/\.[^.]+$/, '') + '.mp4',
      // fileSize is no longer accurate (it shrank). Clear it so the stale
      // large value isn't used for limit checks or sent to the upload-init.
      fileSize: undefined,
    };
  } catch {
    // Compression can fail on unusual codecs or low device storage. Falling
    // back to the raw asset is fine — we upload the original.
    return asset;
  }
}

/**
 * Compress a mixed batch of picker assets: images via `compressImageAsset`,
 * videos via `compressVideoAsset`. Videos are transcoded sequentially (they're
 * CPU/GPU-heavy — running several at once pins the device and makes progress
 * meaningless); images are cheap enough to interleave. `onVideoProgress`
 * receives 0–100 for the currently-compressing video.
 */
export async function compressMediaAssets(
  assets: ImagePickerAsset[],
  onVideoProgress?: (pct: number) => void,
): Promise<ImagePickerAsset[]> {
  const out: ImagePickerAsset[] = [];
  for (const asset of assets) {
    if (asset.type === 'video') {
      out.push(await compressVideoAsset(asset, onVideoProgress));
    } else {
      out.push(await compressImageAsset(asset));
    }
  }
  return out;
}
