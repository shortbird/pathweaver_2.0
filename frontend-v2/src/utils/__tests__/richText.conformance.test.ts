/**
 * Conformance: the three implementations of "the text of this body" agree.
 *
 * A message body is turned into readable text in three places, and all three
 * claim in their docstrings to mirror each other:
 *
 *     backend/utils/rich_text.py          email, notification previews, search
 *     frontend/src/utils/richText.js      the web app, via the DOM
 *     frontend-v2/src/utils/richText.ts   mobile, via regex (native has no DOM)
 *
 * Two of them did not. On 2026-09-03 the mobile one decoded thirteen named
 * entities and passed the rest through, so an announcement containing
 * `caf&eacute;` or `&copy;` read correctly in the email and on the web and
 * showed the raw entity on a phone. It also turned `&nbsp;` into a plain space
 * where the other two produce U+00A0.
 *
 * Reading the code catches none of that: the implementations differ ON PURPOSE,
 * because one has a DOM and one does not. What they owe each other is the same
 * OUTPUT, so they are tested against one corpus instead.
 */

import cases from '@shared/richTextCases.json';
import { htmlToText, isHtml, isBlank } from '../richText';

describe('richText matches the shared corpus', () => {
  it('has a corpus to check against', () => {
    // A conformance test with no cases passes forever.
    expect(cases.cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases.cases)('$why', ({ input, text, isHtml: html, isBlank: blank }) => {
    expect(htmlToText(input)).toBe(text);
    expect(isHtml(input)).toBe(html);
    expect(isBlank(input)).toBe(blank);
  });
});
