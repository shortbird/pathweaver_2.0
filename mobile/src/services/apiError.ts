/**
 * Shared ApiError types + narrowing helpers.
 *
 * The backend wraps errors as either `{ error: string }` or
 * `{ error: { message: string, code?: string } }`. `extractApiError` returns
 * a safe, displayable message without ever rendering raw server internals.
 */

// We intentionally avoid `import axios from 'axios'` here — loading the axios
// module eagerly initializes its fetch adapter, which crashes under Jest's
// Expo runtime. Duck-typing the shape is sufficient; any caller that hands us
// a real AxiosError will match.

export interface ApiErrorBody {
  error?: string | { message?: string; code?: string };
  message?: string;
}

interface AxiosErrorLike {
  isAxiosError?: boolean;
  __isAxios?: boolean; // test-only marker (see apiError.test.ts)
  response?: { status?: number; data?: unknown };
}

export interface ApiError {
  status?: number;
  code?: string;
  message: string;
  isNetworkError: boolean;
  isAuthError: boolean;
}

const SAFE_FALLBACK = 'Something went wrong. Please try again.';

export function isAxiosError(err: unknown): err is AxiosErrorLike & { response?: { status: number; data: ApiErrorBody } } {
  if (!err || typeof err !== 'object') return false;
  const e = err as AxiosErrorLike;
  if (e.isAxiosError === true || e.__isAxios === true) return true;
  // Duck-type: anything thrown with response.data looks like an axios error.
  // authStore tests (and older call sites) mock rejections as plain objects
  // without the isAxiosError flag, so rely on shape rather than branding.
  if (e.response && typeof e.response === 'object' && 'data' in e.response) return true;
  return false;
}

/** Map any thrown value to a sanitized ApiError the UI can render. */
export function extractApiError(err: unknown, fallback: string = SAFE_FALLBACK): ApiError {
  if (isAxiosError(err)) {
    const hasResponse = !!err.response;
    const status = err.response?.status;
    const body = err.response?.data as ApiErrorBody | undefined;
    let message = fallback;
    let code: string | undefined;

    if (body && typeof body === 'object') {
      const raw = body.error;
      if (typeof raw === 'string') {
        message = raw;
      } else if (raw && typeof raw === 'object') {
        if (typeof raw.message === 'string') message = raw.message;
        if (typeof raw.code === 'string') code = raw.code;
      } else if (typeof body.message === 'string') {
        message = body.message;
      }
    }

    return {
      status,
      code,
      message: sanitizeMessage(message, fallback),
      isNetworkError: !hasResponse,
      isAuthError: status === 401 || status === 403,
    };
  }

  if (err instanceof Error) {
    return {
      message: sanitizeMessage(err.message, fallback),
      isNetworkError: false,
      isAuthError: false,
    };
  }

  return { message: fallback, isNetworkError: false, isAuthError: false };
}

/**
 * Message from a response BODY (not a thrown error) — for call sites that
 * read `res.data` on a 2xx with `success: false`, or a fetch() JSON body.
 * Same rules as extractApiError: `error` may be a string or the prod
 * envelope `{ message, code, timestamp, request_id }`.
 */
export function apiErrorBodyMessage(body: unknown, fallback: string = SAFE_FALLBACK): string {
  if (!body || typeof body !== 'object') return fallback;
  const b = body as ApiErrorBody;
  const raw = b.error;
  if (typeof raw === 'string') return sanitizeMessage(raw, fallback);
  if (raw && typeof raw === 'object' && typeof raw.message === 'string') {
    return sanitizeMessage(raw.message, fallback);
  }
  if (typeof b.message === 'string') return sanitizeMessage(b.message, fallback);
  return fallback;
}

/**
 * Coerce anything a caller might hand a toast/alert into a renderable string.
 * Sentry 6cbb6c10: an Android crash "Objects are not valid as a React child
 * (found: object with keys {code, message, request_id, timestamp})" came from
 * `toast.error(err.response?.data?.error || '...')` receiving the prod error
 * envelope object. This is the safety net under every toast and alert.
 */
export function toDisplayMessage(value: unknown, fallback: string = SAFE_FALLBACK): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!value || typeof value !== 'object') return fallback;
  if (value instanceof Error) return sanitizeMessage(value.message, fallback);
  const v = value as { message?: unknown; error?: unknown };
  if (typeof v.message === 'string') return sanitizeMessage(v.message, fallback);
  if (v.error !== undefined) return apiErrorBodyMessage(value, fallback);
  return fallback;
}

// Reject messages that look like stack traces, SQL, or internal paths — only
// let "human" messages through to the UI. Everything else collapses to fallback.
function sanitizeMessage(raw: string, fallback: string): string {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.length > 300) return fallback;
  if (/\b(Traceback|at \w+:\d+|File ")/i.test(trimmed)) return fallback;
  if (/\b(SELECT|INSERT|UPDATE|DELETE)\s+[\w*]/i.test(trimmed)) return fallback;
  return trimmed;
}
