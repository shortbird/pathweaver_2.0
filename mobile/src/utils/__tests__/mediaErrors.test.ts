/**
 * describeMediaError() — Sentry OPTIO-MOBILE-Q.
 *
 * A student picked a photo that lived in iCloud and was never downloaded to
 * the device. iOS threw `PHPhotosErrorDomain error 3164`; CaptureSheet showed
 * nothing at all, the evidence sheet said "That didn't work. Please try
 * again." (it fails identically every retry until the phone has a network),
 * and the LTI editor put the raw native string in its error banner.
 */

import {
  classifyMediaError,
  describeMediaError,
  isCancelledMediaError,
  isExpectedMediaError,
} from '../mediaErrors';

// Exactly as iOS reports it — note the curly apostrophe.
const icloudError = new Error(
  'The operation couldn’t be completed. (PHPhotosErrorDomain error 3164.)'
);

const FALLBACK = { title: 'Something went wrong', message: "That didn't work. Please try again." };

describe('classifyMediaError', () => {
  it('recognizes the iCloud-not-downloaded error', () => {
    expect(classifyMediaError(icloudError)).toBe('icloud');
  });

  it.each([
    [3072, 'cancelled'],
    [3164, 'icloud'],
    [3302, 'unavailable'],
    [3303, 'unavailable'],
    [3305, 'no-space'],
    [3310, 'permission'],
    [3311, 'permission'],
  ])('maps PHPhotosErrorDomain %i to %s', (code, kind) => {
    expect(classifyMediaError(new Error(`(PHPhotosErrorDomain error ${code}.)`))).toBe(kind);
  });

  it('does not guess at an unrecognized failure', () => {
    expect(classifyMediaError(new Error('Something exploded'))).toBe('unknown');
    expect(classifyMediaError(new Error('(PHPhotosErrorDomain error 9999.)'))).toBe('unknown');
  });

  it.each([null, undefined, '', {}])('survives %p', (err) => {
    expect(classifyMediaError(err)).toBe('unknown');
  });

  it('reads a plain string as well as an Error', () => {
    expect(classifyMediaError('PHPhotosErrorDomain error 3164')).toBe('icloud');
  });
});

describe('describeMediaError', () => {
  it('explains the iCloud case instead of saying "try again"', () => {
    const copy = describeMediaError(icloudError, FALLBACK);
    expect(copy).not.toBeNull();
    expect(copy).not.toEqual(FALLBACK);
    expect(copy!.title).toMatch(/iCloud/i);
    // The actionable part: this needs a network, not another tap.
    expect(copy!.message).toMatch(/Wi-Fi/i);
  });

  it('never leaks the native error text to the user', () => {
    const copy = describeMediaError(icloudError, FALLBACK);
    expect(copy!.message).not.toMatch(/PHPhotos/i);
    expect(copy!.title).not.toMatch(/PHPhotos/i);
  });

  it('returns the caller fallback for anything it does not recognize', () => {
    expect(describeMediaError(new Error('boom'), FALLBACK)).toEqual(FALLBACK);
  });

  it('returns null for a cancel, so no dialog is shown', () => {
    expect(describeMediaError(new Error('(PHPhotosErrorDomain error 3072.)'), FALLBACK)).toBeNull();
  });

  // Every recognized code must carry real copy — a missing table entry would
  // otherwise fall through to the generic fallback unnoticed.
  it.each([
    [3305, 'no-space'],
    [3310, 'permission'],
    [3303, 'unavailable'],
  ])('has its own copy for code %i (%s)', (code) => {
    const copy = describeMediaError(new Error(`(PHPhotosErrorDomain error ${code}.)`), FALLBACK);
    expect(copy).not.toBeNull();
    expect(copy).not.toEqual(FALLBACK);
    expect(copy!.title.length).toBeGreaterThan(0);
    expect(copy!.message.length).toBeGreaterThan(0);
  });
});

describe('cancel handling', () => {
  it('treats a user cancel as not-an-error', () => {
    expect(isCancelledMediaError(new Error('(PHPhotosErrorDomain error 3072.)'))).toBe(true);
    expect(isExpectedMediaError(new Error('(PHPhotosErrorDomain error 3072.)'))).toBe(false);
  });

  it('does not swallow a real failure as a cancel', () => {
    expect(isCancelledMediaError(icloudError)).toBe(false);
    expect(isExpectedMediaError(icloudError)).toBe(true);
    expect(isExpectedMediaError(new Error('boom'))).toBe(false);
  });
});
