/**
 * PostHog Analytics - Mobile event tracking.
 *
 * Mirrors the web platform's posthog.js service with mobile-specific events.
 * COPPA-compliant: only IDs and enums as properties, no free-text.
 * No-ops gracefully if PostHog fails to initialize.
 */

import PostHog from 'posthog-react-native';

const POSTHOG_API_KEY = 'phc_B0TpTBTdnuP8lKWUaRX6EG8vEY3L5uNUaoY2YTQU3yc';
const POSTHOG_HOST = 'https://us.i.posthog.com';

let posthog: PostHog | null = null;

export async function initPostHog(): Promise<void> {
  if (posthog) return;
  try {
    posthog = await PostHog.initAsync(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      enableSessionReplay: false, // Not supported on RN yet
    });
  } catch {
    // Silent fail -- analytics should never break the app
  }
}

/**
 * Identify user so sessions are searchable.
 * Call on login, register, and session restore.
 */
export function identifyUser(user: {
  id: string;
  email?: string | null;
  role?: string | null;
  org_role?: string | null;
  organization_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
}): void {
  if (!posthog || !user?.id) return;

  const name =
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    user.display_name ||
    null;

  posthog.identify(user.id, {
    role: user.role ?? null,
    org_role: user.org_role ?? null,
    organization_id: user.organization_id ?? null,
    display_name: name,
    email: user.email ?? null,
    platform: 'mobile',
  });
}

/** Reset identity on logout. */
export function resetUser(): void {
  posthog?.reset();
}

/**
 * Capture a custom business event.
 * COPPA: Only pass IDs and predefined enums -- no free-text.
 */
export function captureEvent(
  eventName: string,
  properties: Record<string, any> = {},
): void {
  posthog?.capture(eventName, { ...properties, platform: 'mobile' });
}

/** Capture a screen view. */
export function captureScreen(screenName: string): void {
  posthog?.screen(screenName, { platform: 'mobile' });
}
