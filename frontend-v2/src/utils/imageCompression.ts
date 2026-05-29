/**
 * Client-side image compression for upload.
 *
 * Photos from a modern phone's Camera Roll are routinely 4–6 MB HEIC and
 * 4032×3024 px. Re-encoding to JPEG at 0.8 quality and capping the long
 * edge at 2048 px lands in the 200–600 KB range — about a 90% bandwidth
 * cut without visible quality loss for our use case (evidence display,
 * not print).
 *
 * This is a no-op on web (the system file picker hands us a Blob the
 * browser already handles) and a no-op for video/audio assets.
 *
 * Pattern:
 *   const compressed = await compressImageAssets(result.assets);
 *   addMedia(compressed);
 *
 * The output keeps `expo-image-picker`'s ImagePickerAsset shape so the
 * existing media-attach pipeline (which assumes `{uri, type, fileName,
 * fileSize}`) doesn't care.
 */

import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';

const MAX_LONG_EDGE = 2048;
const COMPRESS_QUALITY = 0.8;
// Below this size, skip the round-trip through the manipulator — it'd be
// pure overhead. ~500 KB is already small enough.
const SKIP_BELOW_BYTES = 500 * 1024;

/** Lazy-require so the web bundle doesn't try to load the native module. */
function getManipulator(): typeof import('expo-image-manipulator') | null {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-image-manipulator');
  } catch {
    return null;
  }
}

/**
 * Compress a single image asset. Returns the input unchanged if compression
 * isn't applicable (video/audio, already small, native module missing,
 * or anything throws).
 */
export async function compressImageAsset(asset: ImagePickerAsset): Promise<ImagePickerAsset> {
  const Manipulator = getManipulator();
  if (!Manipulator) return asset;
  if (asset.type !== 'image') return asset;
  if ((asset.fileSize ?? 0) > 0 && (asset.fileSize ?? 0) <= SKIP_BELOW_BYTES) return asset;

  const width = asset.width || MAX_LONG_EDGE;
  const height = asset.height || MAX_LONG_EDGE;
  const longEdge = Math.max(width, height);

  const actions: Array<{ resize: { width?: number; height?: number } }> = [];
  if (longEdge > MAX_LONG_EDGE) {
    const scale = MAX_LONG_EDGE / longEdge;
    actions.push({ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } });
  }

  try {
    const result = await Manipulator.manipulateAsync(asset.uri, actions, {
      compress: COMPRESS_QUALITY,
      format: Manipulator.SaveFormat.JPEG,
    });
    return {
      ...asset,
      uri: result.uri,
      // SaveFormat.JPEG means we lose the original extension; align fileName so
      // downstream MIME-type sniffing stays consistent.
      fileName: (asset.fileName || 'image').replace(/\.[^.]+$/, '') + '.jpg',
      width: result.width ?? asset.width,
      height: result.height ?? asset.height,
      // fileSize is no longer accurate — clear it. Callers that need the
      // post-compression size should stat the file themselves; almost none do.
      fileSize: undefined,
    };
  } catch {
    // Manipulator can fail on certain HEIC variants. Falling back to the
    // raw asset is fine — we'll upload the original.
    return asset;
  }
}

/** Convenience: compress an array of picker assets in parallel. */
export async function compressImageAssets(assets: ImagePickerAsset[]): Promise<ImagePickerAsset[]> {
  return Promise.all(assets.map(compressImageAsset));
}
