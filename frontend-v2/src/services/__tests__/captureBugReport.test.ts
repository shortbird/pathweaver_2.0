/**
 * captureBugReport must send each in-app bug report as its OWN Sentry issue:
 * a unique fingerprint (no stack-based merge), a `feature:bug_report` tag for
 * one-filter triage, and the diagnostics attached as context.
 */

describe('captureBugReport', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    jest.resetModules();
  });

  it('fingerprints per report and tags it as a bug_report', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://test@o0.ingest.sentry.io/1';
    // Fresh module graph so initSentry() runs with the DSN set and wires the
    // (mocked) @sentry/react-native impl.
    const Sentry = require('@sentry/react-native');
    (Sentry.captureMessage as jest.Mock).mockClear();
    const sentry = require('@/src/services/sentry');
    sentry.initSentry();

    sentry.captureBugReport('Video upload is broken', {
      reportId: 'abc123',
      route: '/feed',
      platform: 'ios',
      build: '14',
      appVersion: '1.0.0',
      diagnostics: { device_model: 'iPhone' },
    });

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [title, ctx] = (Sentry.captureMessage as jest.Mock).mock.calls[0];
    expect(title).toBe('[Bug] Video upload is broken');
    expect(ctx.level).toBe('warning');
    expect(ctx.fingerprint).toEqual(['bug-report', 'abc123']);
    expect(ctx.tags.feature).toBe('bug_report');
    expect(ctx.tags.report_route).toBe('/feed');
    expect(ctx.contexts.bug_report.report_id).toBe('abc123');
    expect(ctx.contexts.diagnostics.device_model).toBe('iPhone');
  });

  it('two reports get distinct fingerprints (separate issues)', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://test@o0.ingest.sentry.io/1';
    const Sentry = require('@sentry/react-native');
    (Sentry.captureMessage as jest.Mock).mockClear();
    const sentry = require('@/src/services/sentry');
    sentry.initSentry();

    sentry.captureBugReport('A', { reportId: 'id-a' });
    sentry.captureBugReport('B', { reportId: 'id-b' });

    const calls = (Sentry.captureMessage as jest.Mock).mock.calls;
    expect(calls[0][1].fingerprint).toEqual(['bug-report', 'id-a']);
    expect(calls[1][1].fingerprint).toEqual(['bug-report', 'id-b']);
  });
});
