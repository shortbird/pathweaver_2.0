/**
 * E4 — postRefreshWithRetry retries once on transient failure (network error
 * or 5xx) and fast-fails on 4xx.
 */

import { postRefreshWithRetry } from '@/src/services/refreshRetry';
import type { AxiosError } from 'axios';

function axiosErr(status?: number): AxiosError {
  const err = new Error('boom') as AxiosError;
  err.isAxiosError = true;
  if (status !== undefined) {
    err.response = {
      status,
      statusText: 'err',
      data: {},
      headers: {},
      config: {} as AxiosError['config'],
    } as AxiosError['response'];
  }
  return err;
}

const noSleep = () => Promise.resolve();

describe('postRefreshWithRetry (E4)', () => {
  it('retries once on 502 and succeeds', async () => {
    let calls = 0;
    const post = jest.fn(async () => {
      calls += 1;
      if (calls === 1) throw axiosErr(502);
      return { data: { access_token: 'a', refresh_token: 'r' } };
    });

    const result = await postRefreshWithRetry(
      { refresh_token: 't' },
      { post, sleep: noSleep },
    );
    expect(result.data.access_token).toBe('a');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('retries once on a network error (no response)', async () => {
    let calls = 0;
    const post = jest.fn(async () => {
      calls += 1;
      if (calls === 1) throw axiosErr(undefined);
      return { data: { access_token: 'a', refresh_token: 'r' } };
    });

    const result = await postRefreshWithRetry({}, { post, sleep: noSleep });
    expect(result.data.access_token).toBe('a');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 401 (fast-fail)', async () => {
    const post = jest.fn(async () => {
      throw axiosErr(401);
    });

    await expect(
      postRefreshWithRetry({}, { post, sleep: noSleep }),
    ).rejects.toBeDefined();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 400 (fast-fail)', async () => {
    const post = jest.fn(async () => {
      throw axiosErr(400);
    });

    await expect(
      postRefreshWithRetry({}, { post, sleep: noSleep }),
    ).rejects.toBeDefined();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('propagates second error if retry also fails', async () => {
    const post = jest.fn(async () => {
      throw axiosErr(503);
    });

    await expect(
      postRefreshWithRetry({}, { post, sleep: noSleep }),
    ).rejects.toBeDefined();
    expect(post).toHaveBeenCalledTimes(2);
  });
});
