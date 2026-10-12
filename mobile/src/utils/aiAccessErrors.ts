/**
 * The refusals the backend sends when AI is switched off for the learner
 * (backend/utils/ai_access.py check_ai_access). They are an expected product
 * state -- a parent or a school chose this -- not a failure:
 *   - not reported to Sentry (Sentry 64448412 / e7429a56 were these on web);
 *   - shown to the person as the server's sentence ("Ask your parent to enable
 *     them in their dashboard"), never as the raw `ai_disabled` error token.
 *
 * Mirrors web/src/utils/aiAccessErrors.ts.
 */
export const AI_DISABLED_CODES: ReadonlySet<string> = new Set([
  'DEPENDENT_AI_DISABLED',
  'DEPENDENT_AI_FEATURE_DISABLED',
  'ORG_AI_DISABLED',
  'ORG_AI_FEATURE_DISABLED',
]);

type MaybeAxiosError = {
  response?: { status?: number; data?: unknown };
} | null | undefined;

function bodyOf(err: unknown): { code?: unknown; message?: unknown } | null {
  const data = (err as MaybeAxiosError)?.response?.data;
  return data && typeof data === 'object' ? (data as { code?: unknown; message?: unknown }) : null;
}

/** True for a 403 whose body carries one of the AI-switched-off codes. */
export function isAIDisabledRefusal(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = bodyOf(err)?.code;
  return (err as MaybeAxiosError)?.response?.status === 403
    && typeof code === 'string' && AI_DISABLED_CODES.has(code);
}

/** The server's human sentence for an AI-switched-off refusal, else null. */
export function aiDisabledMessage(err: unknown): string | null {
  if (!isAIDisabledRefusal(err)) return null;
  const message = bodyOf(err)?.message;
  return typeof message === 'string' && message.trim()
    ? message.trim()
    : 'AI features are turned off for this account.';
}
