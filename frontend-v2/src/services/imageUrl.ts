/**
 * Image URL utilities.
 *
 * HEIC/HEIF files uploaded from iPhones can't be decoded by browsers or
 * React Native's <Image> on non-Apple platforms.  Supabase Storage exposes a
 * `/render/image/` path that transcodes images server-side, so swapping the
 * path segment is enough to get a browser-safe JPEG back.
 */

const HEIC_RE = /\.heic$|\.heif$/i;

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
 */
export function displayImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!HEIC_RE.test(url)) return url;
  // Supabase render endpoint converts the image server-side
  return url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
}
