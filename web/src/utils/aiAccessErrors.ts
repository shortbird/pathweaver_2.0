/**
 * The refusals the backend sends when AI is switched off for the learner
 * (backend/utils/ai_access.py check_ai_access). They are an expected product
 * state -- a parent or a school chose this -- not a failure:
 *   - not reported to Sentry (Sentry 64448412 / e7429a56 were these);
 *   - shown to the person as the server's sentence ("Ask your parent to enable
 *     them in their dashboard"), never as the raw `ai_disabled` error token.
 */
export const AI_DISABLED_CODES: ReadonlySet<string> = new Set([
  'DEPENDENT_AI_DISABLED',
  'DEPENDENT_AI_FEATURE_DISABLED',
  'ORG_AI_DISABLED',
  'ORG_AI_FEATURE_DISABLED',
])

type MaybeAxiosError = {
  response?: { status?: number; data?: { code?: unknown; message?: unknown } | null }
} | null | undefined

/** True for a 403 whose body carries one of the AI-switched-off codes. */
export function isAIDisabledRefusal(err: MaybeAxiosError): boolean {
  const code = err?.response?.data?.code
  return err?.response?.status === 403 && typeof code === 'string' && AI_DISABLED_CODES.has(code)
}

/** The server's human sentence for an AI-switched-off refusal, else null. */
export function aiDisabledMessage(err: MaybeAxiosError): string | null {
  if (!isAIDisabledRefusal(err)) return null
  const message = err?.response?.data?.message
  return typeof message === 'string' && message
    ? message
    : 'AI features are turned off for this account.'
}
