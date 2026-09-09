/**
 * The second argument of captureException/captureMessage only reaches the event
 * when it looks like a Sentry CaptureContext. Our call sites write shorthand —
 * `{ stage: 'capture-picker-launch' }`, `{ where: 'useQuestDetail' }` — which the
 * SDK reads as an event Hint and drops, so an iOS Photos failure arrived under
 * the shared `construct(native)` culprit with nothing saying which flow threw it
 * (OPTIO-MOBILE-Q). The wrapper normalizes instead of the call sites.
 */

import { toCaptureContext } from '@/src/services/sentry';

describe('toCaptureContext', () => {
  it('folds shorthand keys into extra so they survive the SDK', () => {
    expect(toCaptureContext({ stage: 'capture-picker-launch' })).toEqual({
      extra: { stage: 'capture-picker-launch' },
      tags: { stage: 'capture-picker-launch' },
    });
  });

  it('promotes stage and where to tags — the flow is what you filter on', () => {
    const ctx = toCaptureContext({ where: 'useQuestDetail', questId: 'q-1' });
    expect(ctx?.tags).toEqual({ where: 'useQuestDetail' });
    expect(ctx?.extra).toEqual({ where: 'useQuestDetail', questId: 'q-1' });
  });

  it('leaves a real capture context untouched', () => {
    const real = {
      extra: { method: 'GET', status: 500 },
      fingerprint: ['api-error', 'GET', '/api/x', '500'],
    };
    expect(toCaptureContext(real)).toEqual(real);
  });

  it('rescues the shorthand key from a MIXED object without losing the extra', () => {
    // uploadQueue passes { stage, extra } — the extra arrived, the stage did not,
    // which is the failure mode that looks like it works.
    const ctx = toCaptureContext({
      stage: 'upload-queue-inline',
      extra: { eventId: 'evt-9' },
    });
    expect(ctx?.extra).toEqual({ eventId: 'evt-9', stage: 'upload-queue-inline' });
    expect(ctx?.tags).toEqual({ stage: 'upload-queue-inline' });
  });

  it('does not clobber tags the caller set itself', () => {
    const ctx = toCaptureContext({ stage: 'x', tags: { feature: 'ota_diagnostics' } });
    expect(ctx?.tags).toEqual({ feature: 'ota_diagnostics', stage: 'x' });
  });

  it('ignores a non-string flow value rather than sending a bad tag', () => {
    const ctx = toCaptureContext({ stage: 42 });
    expect(ctx?.tags).toBeUndefined();
    expect(ctx?.extra).toEqual({ stage: 42 });
  });

  it('returns undefined for nothing worth sending', () => {
    expect(toCaptureContext(undefined)).toBeUndefined();
    expect(toCaptureContext({})).toBeUndefined();
  });
});

describe('captureException wiring', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    jest.resetModules();
  });

  it('hands the SDK a context the event will actually keep', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://test@o0.ingest.sentry.io/1';
    const Sentry = require('@sentry/react-native');
    (Sentry.captureException as jest.Mock).mockClear();
    const sentry = require('@/src/services/sentry');
    sentry.initSentry();

    const err = new Error('The operation couldn’t be completed. (PHPhotosErrorDomain error 3164.)');
    sentry.captureException(err, { stage: 'capture-picker-launch' });

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const [sent, ctx] = (Sentry.captureException as jest.Mock).mock.calls[0];
    expect(sent).toBe(err);
    expect(ctx.extra.stage).toBe('capture-picker-launch');
    expect(ctx.tags.stage).toBe('capture-picker-launch');
  });
});
