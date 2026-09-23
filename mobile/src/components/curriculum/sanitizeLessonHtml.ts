/**
 * Strip XSS vectors from lesson HTML before rendering with
 * dangerouslySetInnerHTML. Lesson content is authored by admins/org_admins,
 * so a compromised admin account or a stored XSS in the curriculum builder
 * would otherwise reach student browsers via the lesson viewer.
 *
 * Web-only: callers must already gate on `Platform.OS === 'web'`.
 */
import DOMPurify from 'dompurify';

// dompurify auto-binds to `window` at module load when one is present (the
// browser runtime always has it; LessonViewer gates this code path on
// Platform.OS === 'web'). Tests opt into jsdom via the @jest-environment
// pragma so DOMPurify.sanitize is a real function.
//
// On native (Hermes) there is no window, so DOMPurify loads as a stub with no
// `sanitize` method. Calling it threw "undefined is not a function at
// sanitizeLessonHtml" on iPad (Sentry ef1eb8a9). With no sanitizer the only
// safe answer is no HTML at all: return '' rather than the raw input.
export function sanitizeLessonHtml(html: string): string {
  if (!html || typeof DOMPurify?.sanitize !== 'function') return '';
  return DOMPurify.sanitize(html);
}
