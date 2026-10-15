/**
 * Is this "link" really a path to a file on the student's own device?
 *
 * Ticket d0cc8d45: a student on a Chromebook opened the evidence Link picker
 * and pasted `file:///home/chronos/u-.../MyFiles/Downloads/Screenshot ....png`.
 * It saved as a link block. The file was never uploaded, so the teacher saw
 * nothing — 18 blocks from 2 students over a month before anyone noticed.
 * On a phone the same mistake is a `content://` or `file://` URI copied out
 * of a file manager.
 *
 * The same rule lives in web/src/utils/localFilePath.js. Keep them in step.
 */

// Schemes that only mean something on the device that made them.
const DEVICE_SCHEME = /^(file|blob|content):/i;
// C:\Users\... or C:/Users/...
const WINDOWS_DRIVE = /^[a-z]:[\\/]/i;
// \\server\share
const UNC_PATH = /^\\\\[^\\]/;
// Bare absolute paths on macOS, Linux, ChromeOS, Android, and ~/ shorthand.
const BARE_LOCAL_PATH = /^(~\/|\/(home|Users|mnt|media|Volumes|storage|sdcard)\/)/;
// ChromeOS's user directory, wherever it appears in a non-web string.
const CHROMEOS_USER_DIR = /(^|\/)chronos\/u-/i;
const WEB_SCHEME = /^https?:/i;

export function isLocalFilePath(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  if (DEVICE_SCHEME.test(v)) return true;
  if (WINDOWS_DRIVE.test(v)) return true;
  if (UNC_PATH.test(v)) return true;
  if (BARE_LOCAL_PATH.test(v)) return true;
  if (!WEB_SCHEME.test(v) && CHROMEOS_USER_DIR.test(v)) return true;
  return false;
}

/** The message a student sees when they paste a local path into a link field. */
export const LOCAL_FILE_PATH_MESSAGE =
  "That's a file on your computer, not a link, so no one else can open it. Use Upload to add the file instead.";

type NamedItem = { url?: unknown; title?: unknown; filename?: unknown } | null | undefined;

/**
 * The file's own name, for "<name> never uploaded." Prefers a title the
 * student typed, then the last segment of the path (either slash).
 */
export function localFileName(item: NamedItem): string {
  const named = String(item?.title || item?.filename || '').trim();
  if (named && !isLocalFilePath(named)) return named;
  const raw = String(item?.url || '').split(/[?#]/)[0];
  let name = raw.split(/[\\/]/).filter(Boolean).pop() || '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // Malformed percent-encoding — keep the raw segment.
  }
  return name || 'This file';
}

/** The warning shown where a saved local-path link would otherwise be a dead link. */
export function neverUploadedMessage(item: NamedItem): string {
  return `${localFileName(item)} never uploaded. Add it again with Upload.`;
}
