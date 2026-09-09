/**
 * Human-readable messages for native photo/video picker failures.
 *
 * iOS reports these as `PHPhotosErrorDomain error <code>` inside an Expo
 * CodedError, so what reached the user was either nothing at all (CaptureSheet
 * reported to Sentry and showed no dialog) or "That didn't work. Please try
 * again." Both are wrong for the most common case: the photo lives in iCloud
 * and was never downloaded to the device, so "try again" fails identically
 * until the phone is back on a network (Sentry OPTIO-MOBILE-Q).
 *
 * Codes are from Apple's PHPhotosError enum.
 */

const PH_USER_CANCELLED = 3072;
const PH_NETWORK_ACCESS_REQUIRED = 3164;  // asset is in iCloud, not on device
const PH_MISSING_RESOURCE = 3303;
const PH_INVALID_RESOURCE = 3302;
const PH_NOT_ENOUGH_SPACE = 3305;
const PH_ACCESS_RESTRICTED = 3310;
const PH_ACCESS_USER_DENIED = 3311;

export type MediaErrorKind =
  | 'cancelled'
  | 'icloud'
  | 'no-space'
  | 'permission'
  | 'unavailable'
  | 'unknown';

export interface MediaErrorCopy {
  title: string;
  message: string;
}

/** The PHPhotosErrorDomain code in an error, if it carries one. */
function photosErrorCode(err: unknown): number | null {
  const text = typeof err === 'string' ? err : String((err as Error)?.message ?? err ?? '');
  const match = /PHPhotosErrorDomain error (\d+)/i.exec(text);
  return match ? Number(match[1]) : null;
}

export function classifyMediaError(err: unknown): MediaErrorKind {
  switch (photosErrorCode(err)) {
    case PH_USER_CANCELLED:
      return 'cancelled';
    case PH_NETWORK_ACCESS_REQUIRED:
      return 'icloud';
    case PH_NOT_ENOUGH_SPACE:
      return 'no-space';
    case PH_ACCESS_RESTRICTED:
    case PH_ACCESS_USER_DENIED:
      return 'permission';
    case PH_MISSING_RESOURCE:
    case PH_INVALID_RESOURCE:
      return 'unavailable';
  }

  // Android and non-Photos failures carry no code, so fall back to wording.
  // Deliberately narrow: a wrong guess here replaces a usable generic message
  // with confident, misleading advice.
  const text = String((err as Error)?.message ?? err ?? '').toLowerCase();
  if (text.includes('icloud')) return 'icloud';
  if (text.includes('enospc') || text.includes('no space left')) return 'no-space';
  return 'unknown';
}

const COPY: Record<Exclude<MediaErrorKind, 'cancelled' | 'unknown'>, MediaErrorCopy> = {
  icloud: {
    title: 'That photo is still in iCloud',
    message:
      "It hasn't been downloaded to this device yet. Connect to Wi-Fi and try again, "
      + 'or open it in the Photos app first to download it.',
  },
  'no-space': {
    title: 'Not enough space',
    message:
      "There isn't enough free space on this device to prepare that file. "
      + 'Free up some space and try again.',
  },
  permission: {
    title: 'Photos access needed',
    message:
      "Optio doesn't have permission to open that photo. You can allow access in "
      + 'Settings, under Optio, then Photos.',
  },
  unavailable: {
    title: 'That photo is unavailable',
    message:
      "It couldn't be opened, and may have been moved or deleted. Please pick a different one.",
  },
};

/**
 * Copy to show for a picker/attach failure, or null when the user simply
 * cancelled (no dialog, and nothing worth reporting).
 */
export function describeMediaError(err: unknown, fallback: MediaErrorCopy): MediaErrorCopy | null {
  const kind = classifyMediaError(err);
  if (kind === 'cancelled') return null;
  if (kind === 'unknown') return fallback;
  return COPY[kind];
}

/** A cancel is a normal outcome, not a failure — don't alert, don't report. */
export function isCancelledMediaError(err: unknown): boolean {
  return classifyMediaError(err) === 'cancelled';
}

/**
 * Whether this failure is the device/library telling us something, rather than
 * a defect in the app. These still get reported, but as a warning-level
 * breadcrumb-friendly message instead of a high-priority exception.
 */
export function isExpectedMediaError(err: unknown): boolean {
  const kind = classifyMediaError(err);
  return kind !== 'unknown' && kind !== 'cancelled';
}
