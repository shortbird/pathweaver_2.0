/**
 * Image URL utilities.
 *
 * HEIC/HEIF files uploaded from iPhones can't be decoded by browsers or
 * React Native's <Image> on non-Apple platforms.  Supabase Storage exposes a
 * `/render/image/` path that transcodes images server-side, so swapping the
 * path segment is enough to get a browser-safe JPEG back.
 */

// Matches the extension at the end of the PATH, not the end of the string:
// signed URLs carry `?token=...` after it, so anchoring on `$` alone stopped
// recognising HEIC the moment these buckets went private.
const HEIC_RE = /\.hei[cf](\?|#|$)/i;

/**
 * True when a URL points to a HEIC/HEIF file.  Useful for reclassifying
 * evidence blocks that were stored as "document" but are really images.
 */
export function isHeicUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return HEIC_RE.test(url);
}

/**
 * Return a displayable image URL. HEIC/HEIF URLs that live in Supabase
 * Storage are rewritten to use the render (transform) endpoint so the
 * server converts them to a format every browser can show.
 *
 * Student and child media now lives in PRIVATE buckets and arrives as a signed
 * URL (`/storage/v1/object/sign/<bucket>/<path>?token=...`). The transform
 * endpoint has a matching `sign` variant that accepts the same token, so the
 * swap is the same idea on a different path segment. Rewriting only the
 * `public` form — as this did — silently left HEIC broken on every signed URL,
 * which after the private-bucket migration is all of them.
 */
export function displayImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!HEIC_RE.test(url)) return url;
  if (url.includes('/storage/v1/object/sign/')) {
    return url.replace('/storage/v1/object/sign/', '/storage/v1/render/image/sign/');
  }
  // Supabase render endpoint converts the image server-side
  return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
}
