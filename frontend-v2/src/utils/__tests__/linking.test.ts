/**
 * Tests for safeOpenURL — the guarded wrapper that stops a non-URL value (e.g. a
 * date that leaked into an evidence link field) from crashing the app via an
 * unopenable intent (Sentry NODE-8).
 */

import { Linking } from 'react-native';
import { safeOpenURL } from '@/src/utils/linking';

describe('safeOpenURL', () => {
  let canOpen: jest.SpyInstance;
  let open: jest.SpyInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    canOpen = jest.spyOn(Linking, 'canOpenURL').mockReset().mockResolvedValue(true);
    open = jest.spyOn(Linking, 'openURL').mockReset().mockResolvedValue(undefined as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it('rejects a date string (the NODE-8 crash value) without calling openURL', async () => {
    await expect(safeOpenURL('08/15/1945')).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('opens a normal https URL', async () => {
    await expect(safeOpenURL('https://example.com/doc.pdf')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/doc.pdf');
  });

  it('prepends https:// to a bare domain', async () => {
    await expect(safeOpenURL('example.com/path')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/path');
  });

  it('rejects a disallowed scheme (e.g. javascript:)', async () => {
    await expect(safeOpenURL('javascript:alert(1)')).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('skips the canOpenURL probe for http(s) — it false-negatives on Android', async () => {
    canOpen.mockResolvedValue(false);
    await expect(safeOpenURL('https://example.com')).resolves.toBe(true);
    expect(canOpen).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith('https://example.com');
  });

  it('returns false (no throw) when the OS cannot open a tel: URL', async () => {
    canOpen.mockResolvedValue(false);
    await expect(safeOpenURL('tel:+15551234567')).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('percent-encodes a document URL with spaces in the filename', async () => {
    await expect(safeOpenURL('https://example.com/My Report.pdf')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/My%20Report.pdf');
  });

  it('does not double-encode an already-encoded URL', async () => {
    await expect(safeOpenURL('https://example.com/My%20Report.pdf')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com/My%20Report.pdf');
  });

  it('returns false for empty / nullish input', async () => {
    await expect(safeOpenURL('')).resolves.toBe(false);
    await expect(safeOpenURL(null)).resolves.toBe(false);
    await expect(safeOpenURL(undefined)).resolves.toBe(false);
  });

  it('never rejects even if openURL throws', async () => {
    open.mockRejectedValue(new Error('boom'));
    await expect(safeOpenURL('https://example.com')).resolves.toBe(false);
  });
});
