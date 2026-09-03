/**
 * Presenting one item out of an evidence block.
 *
 * A block carries a declared `block_type`, but that type is whatever picker the
 * student happened to open — it is not a fact about the file. A student who
 * pastes the URL of a photo into the "Link" picker produces a `link` block
 * holding a .jpg, and a renderer that trusts the type shows a teacher a URL
 * where a picture belongs (Gryffin, 2026-09-02: "The picture evidence is
 * showing as a link instead of a picture").
 *
 * The same block also broke the review layout: with no title on the item, the
 * link's text fell through to the raw storage URL — 200-odd unbreakable
 * characters that widened the pane until the Accept button sat off-screen, so
 * the work could not be given credit at all.
 *
 * So: judge images by the URL, and never print a raw URL as a label.
 */

import { ALLOWED_IMAGE_EXTENSIONS } from './mediaUtils';

const extensionOf = (url) => {
  if (!url || typeof url !== 'string') return '';
  // Storage URLs carry ?token=/&download= query strings, and some carry a
  // fragment; the extension is in the path, so cut both off first.
  const path = url.split(/[?#]/)[0];
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  const dot = lastSegment.lastIndexOf('.');
  return dot === -1 ? '' : lastSegment.slice(dot + 1).toLowerCase();
};

/** Does this URL point at an image, whatever the block claims to be? */
export const isImageUrl = (url) =>
  ALLOWED_IMAGE_EXTENSIONS.includes(extensionOf(url));

/**
 * A readable name for an uploaded file.
 *
 * Uploads are stored as `<uuid>_<YYYYMMDD>_<HHMMSS>_<original name>`, so the
 * last path segment is mostly machine noise. Strip the prefix back to what the
 * student actually named the file.
 */
export const filenameFromUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  const path = url.split(/[?#]/)[0];
  let name = path.slice(path.lastIndexOf('/') + 1);
  try {
    name = decodeURIComponent(name);
  } catch {
    // Malformed percent-encoding — keep the raw segment.
  }
  const stamped = name.match(/^[0-9a-f-]{36}_\d{8}_\d{6}_(.+)$/i);
  return stamped ? stamped[1] : name;
};

/**
 * What to show as the clickable text for an evidence item. Falls back through
 * the item's own labels to the file's name, and only then to a generic word —
 * a raw URL is never the answer, however long or short it is.
 */
export const itemLabel = (item, fallback = 'Open link') => {
  if (!item || typeof item !== 'object') return fallback;
  const named = (item.title || item.filename || '').trim();
  if (named) return named;
  return filenameFromUrl(item.url) || fallback;
};

/** Block content is a string, a {url,...} object, or {items: [...]}. */
export const blockItems = (content) => {
  if (!content || typeof content !== 'object') return [];
  if (Array.isArray(content.items)) return content.items;
  if (content.url) return [content];
  return [];
};
