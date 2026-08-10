/**
 * richText — native-safe mirror of frontend/src/utils/richText.js and
 * backend/utils/rich_text.py. Bodies are plain text (pre-editor) or HTML
 * (editor); every reader has to handle both, without a DOM on native.
 */

import { isHtml, htmlToText } from '../richText';

describe('isHtml', () => {
  it('is false for plain text, empties, and non-strings', () => {
    expect(isHtml('Just a note about pickup')).toBe(false);
    expect(isHtml('a < b and b > c')).toBe(false);
    expect(isHtml('')).toBe(false);
    expect(isHtml(null as any)).toBe(false);
    expect(isHtml(undefined as any)).toBe(false);
  });

  it('is true for editor output', () => {
    expect(isHtml('<p>Hello</p>')).toBe(true);
    expect(isHtml('before <strong>bold</strong> after')).toBe(true);
    expect(isHtml('<a href="https://x.test">link</a>')).toBe(true);
  });
});

describe('htmlToText', () => {
  it('passes plain text through unchanged', () => {
    expect(htmlToText('line one\nline two')).toBe('line one\nline two');
  });

  it('returns empty for nothing', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText(null as any)).toBe('');
  });

  it('strips tags and keeps the words', () => {
    expect(htmlToText('<p>Show and tell is <strong>Friday</strong>.</p>'))
      .toBe('Show and tell is Friday.');
  });

  it('turns block boundaries into newlines so lists stay lines', () => {
    expect(htmlToText('<ul><li>Bring shoes</li><li>Pack lunch</li></ul>'))
      .toBe('Bring shoes\nPack lunch');
    expect(htmlToText('<p>First</p><p>Second</p>')).toBe('First\nSecond');
    expect(htmlToText('One<br>Two')).toBe('One\nTwo');
  });

  it('decodes HTML entities', () => {
    expect(htmlToText('<p>Macaroni &amp; cheese &#39;day&#39; &lt;3</p>'))
      .toBe("Macaroni & cheese 'day' <3");
    expect(htmlToText('<p>a&nbsp;b</p>')).toBe('a b');
  });

  it('drops empty lines left by empty paragraphs', () => {
    expect(htmlToText('<p>Real</p><p></p><p>Also real</p>')).toBe('Real\nAlso real');
  });
});
