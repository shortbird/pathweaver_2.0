/**
 * Downscale + re-encode a photo in the browser before upload.
 *
 * Why this exists: the iCreate registration funnel (and any other required-photo
 * step) accepts photos up to 5MB server-side, but a modern iPhone photo is
 * routinely 3-9MB. Uploading the raw file made every one of a parent's photos
 * bounce off the 5MB wall with no way forward. Compressing on the client caps
 * the longest edge and re-encodes to JPEG, which brings essentially every phone
 * photo comfortably under the limit while staying plenty sharp for an avatar.
 *
 * Robust by design: if anything about decoding/encoding fails (an image type the
 * browser can't draw, a missing canvas, etc.) it returns the ORIGINAL file so the
 * caller's existing upload + error handling still runs. It also returns the
 * original when compression wouldn't actually make the file smaller.
 *
 * iOS Safari can decode HEIC/HEIF into a bitmap, so heic camera-roll photos are
 * handled on the device where they originate.
 */

const DEFAULTS = {
  maxDim: 1600, // cap the longest edge (px) — ample for a circular avatar
  maxBytes: 4.5 * 1024 * 1024, // stay clear of the 5MB server limit
  qualities: [0.82, 0.7, 0.6, 0.5], // step down encode quality until under maxBytes
};

async function decodeToBitmap(file) {
  // createImageBitmap respects EXIF orientation with imageOrientation:'from-image'
  // (so portrait phone photos aren't rotated) and handles HEIC on iOS.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) {
      try {
        return await createImageBitmap(file);
      } catch (_) {
        /* fall through to <img> */
      }
    }
  }
  // Fallback for browsers without createImageBitmap.
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

/**
 * @param {File} file - the picked photo
 * @param {object} [opts] - override maxDim / maxBytes / qualities
 * @returns {Promise<File>} a compressed JPEG File, or the original file on any failure
 */
export async function compressImage(file, opts = {}) {
  const { maxDim, maxBytes, qualities } = { ...DEFAULTS, ...opts };

  if (!file || typeof file !== 'object' || typeof file.size !== 'number') return file;
  const type = (file.type || '').toLowerCase();
  // Only touch raster images. Animated GIFs would lose their animation, so skip.
  const looksImage = type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp|tiff?|bmp|avif|jfif)$/i.test(file.name || '');
  if (!looksImage || type === 'image/gif') return file;

  let bitmap;
  try {
    bitmap = await decodeToBitmap(file);
  } catch (_) {
    return file; // can't decode — let the caller upload the original
  }

  const srcW = bitmap.width || bitmap.naturalWidth;
  const srcH = bitmap.height || bitmap.naturalHeight;
  if (!srcW || !srcH) {
    if (bitmap.close) bitmap.close();
    return file;
  }

  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (bitmap.close) bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  let blob = null;
  for (const q of qualities) {
    // eslint-disable-next-line no-await-in-loop
    const candidate = await canvasToBlob(canvas, q);
    if (!candidate) break;
    blob = candidate;
    if (candidate.size <= maxBytes) break;
  }
  if (!blob || blob.size >= file.size) return file; // no win — keep the original

  const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

export default compressImage;
