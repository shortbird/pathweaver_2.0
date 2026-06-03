/**
 * Safe external-link opening.
 *
 * `Linking.openURL` throws if handed a value the OS can't route — most visibly
 * on Android, where a user-entered value that isn't actually a URL (e.g. a date
 * like "08/15/1945" that leaked into an evidence "link" field) raised an
 * unhandled `JSApplicationIllegalArgumentException: No Activity found to handle
 * Intent` and crashed the screen (Sentry NODE-8).
 *
 * `safeOpenURL` is the single guarded entry point every "open this link" tap
 * should use: it normalizes bare domains, allow-lists the scheme, checks
 * `canOpenURL`, and swallows failures so a bad value is a no-op instead of a
 * crash. Returns true only if the URL was actually opened.
 */

import { Linking } from 'react-native';

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/** A bare host like "example.com" or "sub.example.com/path" — no scheme, no spaces, has a dot. */
const BARE_HOST = /^[^\s/]+\.[^\s/]+/;

/**
 * Open an external URL, defensively. Never throws.
 * @returns true if the link was opened, false if it was rejected/failed.
 */
export async function safeOpenURL(raw?: string | null): Promise<boolean> {
  if (!raw || typeof raw !== 'string') return false;
  let url = raw.trim();
  if (!url) return false;

  // No scheme? Only treat it as a URL if it looks like a host. A value such as
  // "08/15/1945" has no dot-host and slashes/spaces → reject rather than hand
  // the OS an unopenable intent.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(url);
  if (!hasScheme) {
    if (/\s/.test(url) || !BARE_HOST.test(url)) return false;
    url = `https://${url}`;
  }

  const scheme = url.slice(0, url.indexOf(':') + 1).toLowerCase();
  if (!SAFE_SCHEMES.includes(scheme)) return false;

  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
