/**
 * Sentry ef1eb8a9 (optio-mobile, iPad, Hermes):
 * "TypeError: undefined is not a function at sanitizeLessonHtml".
 *
 * On native there is no window, so dompurify loads as a stub without
 * `sanitize`. LessonViewer's HtmlContent called sanitizeLessonHtml(html) in a
 * useMemo that runs BEFORE its `Platform.OS !== 'web'` early return, so every
 * lesson step with HTML content crashed the viewer on iOS/Android.
 *
 * Two guards, both locked in here:
 *   - sanitizeLessonHtml returns '' (never the raw HTML) when DOMPurify has no
 *     sanitize function.
 *   - LessonViewer on native never calls the sanitizer at all.
 *
 * This file runs in the default jest-expo (native, Platform.OS === 'ios')
 * environment on purpose.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { LessonViewer } from '../LessonViewer';
import { sanitizeLessonHtml as mockedSanitize } from '../sanitizeLessonHtml';

// LessonViewer gets a sanitizer that throws exactly like the Hermes crash, so
// any call on native fails the test loudly.
jest.mock('../sanitizeLessonHtml', () => ({
  sanitizeLessonHtml: jest.fn(() => {
    throw new TypeError('undefined is not a function');
  }),
}));

describe('sanitizeLessonHtml without a DOMPurify sanitize (native stub)', () => {
  afterEach(() => {
    jest.dontMock('dompurify');
  });

  it("returns '' and does not throw when DOMPurify.sanitize is missing", () => {
    jest.doMock('dompurify', () => ({ __esModule: true, default: {} }));
    let sanitize: (html: string) => string = () => 'unset';
    jest.isolateModules(() => {
      sanitize = jest.requireActual('../sanitizeLessonHtml').sanitizeLessonHtml;
    });
    const dirty = '<p>Hi</p><script>alert(1)</script>';
    expect(() => sanitize(dirty)).not.toThrow();
    expect(sanitize(dirty)).toBe('');
  });
});

describe('LessonViewer on native', () => {
  it('renders a lesson step with HTML content without calling the sanitizer', () => {
    expect(Platform.OS).not.toBe('web');
    const lesson = {
      id: 'lesson-1',
      quest_id: 'quest-1',
      title: 'Fractions',
      content: { steps: [{ id: 's1', order: 1, title: 'Intro', type: 'text', content: '<p>Hello</p>' }] },
    } as any;

    const { getByText } = render(<LessonViewer lesson={lesson} onClose={() => {}} />);
    expect(getByText('Fractions')).toBeTruthy();
    expect(mockedSanitize).not.toHaveBeenCalled();
  });
});
