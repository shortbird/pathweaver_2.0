/**
 * OtaUpdater — which OTA failures are worth a Sentry event.
 *
 * The trade this file guards is narrow in both directions, so both directions
 * are tested:
 *
 *  - Too loud, and a flaky connection reports on every foreground re-check.
 *    That is OPTIO-MOBILE-5: 3 Android devices, every one of them already
 *    running an OTA bundle, so delivery had never actually failed for them.
 *  - Too quiet, and an OTA that never reaches anyone goes unnoticed, which is
 *    the failure that cost six releases (see the isEmergencyLaunch reporter in
 *    services/sentry.ts).
 *
 * The line between them is not the error string — Android's is a fixed literal
 * that says nothing (see ANDROID_OPAQUE_FETCH_FAILURE) — it is whether the
 * device is stuck on the bundle it shipped with.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import * as Updates from 'expo-updates';
import { captureMessage } from '@/src/services/sentry';
import { OtaUpdater, resetOtaReportDedupe } from '../OtaUpdater';

jest.mock('@/src/services/sentry', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('expo-updates', () => ({
  __esModule: true,
  isEnabled: false,
  isEmbeddedLaunch: false,
  useUpdates: jest.fn(),
}));

const mockUpdates = Updates as unknown as {
  isEmbeddedLaunch: boolean;
  useUpdates: jest.Mock;
};

/** Render with a given check error and embedded-launch state. */
function renderWith(checkError: Error | undefined, isEmbeddedLaunch = false) {
  mockUpdates.isEmbeddedLaunch = isEmbeddedLaunch;
  mockUpdates.useUpdates.mockReturnValue({ checkError, downloadError: undefined });
  return render(<OtaUpdater />);
}

/** Same, for the download half of the pair (OPTIO-MOBILE-N was a download). */
function renderWithDownload(downloadError: Error | undefined, isEmbeddedLaunch = false) {
  mockUpdates.isEmbeddedLaunch = isEmbeddedLaunch;
  mockUpdates.useUpdates.mockReturnValue({ checkError: undefined, downloadError });
  return render(<OtaUpdater />);
}

const reported = () => (captureMessage as jest.Mock).mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdates.isEmbeddedLaunch = false;
  // The dedupe below is process-wide, so each case starts from a clean slate.
  resetOtaReportDedupe();
});

describe('OtaUpdater — transient failures stay quiet', () => {
  // iOS names the underlying condition, so these match on the string alone.
  it.each([
    'The Internet connection appears to be offline.',
    'Network Error',
    'Unknown error: The request timed out',
  ])('does not report the iOS transient failure %p', (msg) => {
    renderWith(new Error(msg));
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('does not report Android\'s opaque wrapper when the device is on an OTA bundle', () => {
    // The exact literal from expo-updates FileDownloader.downloadRemoteUpdate.
    // The real cause never crosses the bridge, so the string is not evidence of
    // anything; isEmbeddedLaunch=false is evidence that delivery works.
    renderWith(new Error('Failed to download remote update'), false);
    expect(captureMessage).not.toHaveBeenCalled();
  });
});

describe('OtaUpdater — genuine failures stay loud', () => {
  it('reports Android\'s opaque wrapper when the device is STUCK on the embedded bundle', () => {
    renderWith(new Error('Failed to download remote update'), true);
    expect(reported()).toEqual(['[OTA] check failed: Failed to download remote update']);
  });

  it('reports a server-side failure regardless of launch state', () => {
    renderWith(new Error('Remote update request not successful'), false);
    expect(reported()).toEqual(['[OTA] check failed: Remote update request not successful']);
  });

  it('reports a manifest/bundle failure regardless of launch state', () => {
    renderWith(new Error('Failed to validate manifest signature'), false);
    expect(reported()).toEqual([
      '[OTA] check failed: Failed to validate manifest signature',
    ]);
  });

  it('groups repeats under one fingerprint so a flapping device is one issue', () => {
    renderWith(new Error('Remote update request not successful'), false);
    const opts = (captureMessage as jest.Mock).mock.calls[0][1];
    expect(opts.fingerprint).toEqual(['ota-check-error']);
    expect(opts.level).toBe('warning');
    expect(opts.tags).toEqual({ feature: 'ota_diagnostics' });
  });
});

describe('OtaUpdater — a stuck device reports once, not all day', () => {
  // The re-check runs on every foreground, so without this the same failure is
  // re-reported for as long as the condition lasts: OPTIO-MOBILE-N was 58
  // events from three devices. Grouping is not enough — the fingerprint above
  // makes them one issue, but the event count still climbs.
  it('reports a repeated failure only once per launch', () => {
    const err = new Error('Failed to load all assets');
    renderWithDownload(err);
    renderWithDownload(err);
    renderWithDownload(err);
    expect(reported()).toEqual(['[OTA] download failed: Failed to load all assets']);
  });

  it('still reports a DIFFERENT failure after one has been reported', () => {
    renderWithDownload(new Error('Failed to load all assets'));
    renderWithDownload(new Error('Failed to validate manifest signature'));
    expect(reported()).toEqual([
      '[OTA] download failed: Failed to load all assets',
      '[OTA] download failed: Failed to validate manifest signature',
    ]);
  });

  it('does not let a check failure silence the same string on download', () => {
    // "the manifest is unreachable" and "the bundle behind it is" are separate
    // facts about the release even when expo-updates words them identically.
    const msg = 'Failed to validate manifest signature';
    renderWith(new Error(msg));
    renderWithDownload(new Error(msg));
    expect(reported()).toEqual([
      `[OTA] check failed: ${msg}`,
      `[OTA] download failed: ${msg}`,
    ]);
  });
});

describe('OtaUpdater — nothing to report', () => {
  it('is silent when there is no error', () => {
    renderWith(undefined);
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    const { toJSON } = renderWith(undefined);
    expect(toJSON()).toBeNull();
  });
});
