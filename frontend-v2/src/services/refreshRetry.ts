/**
 * E4 — call /api/auth/refresh with one jittered retry on transient failure
 * (network error or 5xx). Isolated from api.ts so it can be unit-tested in a
 * jest env without pulling in axios's fetch adapter (which crashes under
 * expo's polyfilled streams).
 */

import type { AxiosError } from 'axios';

type RefreshPayload = { access_token: string; refresh_token: string };

export async function postRefreshWithRetry(
  body: { refresh_token?: string },
  deps: {
    post: (path: string, body: unknown) => Promise<{ data: RefreshPayload }>;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<{ data: RefreshPayload }> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  try {
    return await deps.post('/api/auth/refresh', body);
  } catch (firstErr) {
    const status = (firstErr as AxiosError).response?.status;
    const retryable = status === undefined || status >= 500;
    if (!retryable) throw firstErr;
    await sleep(150 + Math.random() * 200);
    return await deps.post('/api/auth/refresh', body);
  }
}
