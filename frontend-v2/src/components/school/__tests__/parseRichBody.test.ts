/**
 * parseRichBody — the block model RichBody renders from.
 *
 * Input is server-sanitized HTML (backend/utils/rich_text.py ALLOWED_TAGS:
 * p, br, strong/b, em/i, u, s/del, h1-h4, ul/ol/li, blockquote, pre, code,
 * hr, a[href]). Rows that predate the sanitizer can hold anything, so unknown
 * tags must be stripped while their text survives.
 */

import { parseRichBody } from '../RichBody';

const runsText = (runs: any[]) => runs.map((r) => r.text).join('');

describe('parseRichBody', () => {
  it('treats plain text as paragraphs split on blank lines', () => {
    const blocks = parseRichBody('First note.\n\nSecond note.');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('paragraph');
    expect(runsText((blocks[0] as any).runs)).toBe('First note.');
    expect(runsText((blocks[1] as any).runs)).toBe('Second note.');
  });

  it('keeps single newlines inside a plain-text paragraph', () => {
    const blocks = parseRichBody('line one\nline two');
    expect(blocks).toHaveLength(1);
    expect(runsText((blocks[0] as any).runs)).toBe('line one\nline two');
  });

  it('parses paragraphs with inline styling', () => {
    const blocks = parseRichBody('<p>Show and tell is <strong>Friday</strong>!</p>');
    expect(blocks).toHaveLength(1);
    const runs = (blocks[0] as any).runs;
    expect(runs).toEqual([
      expect.objectContaining({ text: 'Show and tell is ', bold: false }),
      expect.objectContaining({ text: 'Friday', bold: true }),
      expect.objectContaining({ text: '!', bold: false }),
    ]);
  });

  it('handles nested and aliased inline tags', () => {
    const blocks = parseRichBody('<p><b>bold <i>both</i></b> <u>under</u> <s>gone</s> <code>x</code></p>');
    const runs = (blocks[0] as any).runs;
    expect(runs).toEqual([
      expect.objectContaining({ text: 'bold ', bold: true, italic: false }),
      expect.objectContaining({ text: 'both', bold: true, italic: true }),
      expect.objectContaining({ text: ' ' }),
      expect.objectContaining({ text: 'under', underline: true }),
      expect.objectContaining({ text: ' ' }),
      expect.objectContaining({ text: 'gone', strike: true }),
      expect.objectContaining({ text: ' ' }),
      expect.objectContaining({ text: 'x', code: true }),
    ]);
  });

  it('parses headings with their level', () => {
    const blocks = parseRichBody('<h2>Fall Festival</h2><p>Details below.</p>');
    expect(blocks[0]).toEqual(expect.objectContaining({ type: 'heading', level: 2 }));
    expect(runsText((blocks[0] as any).runs)).toBe('Fall Festival');
  });

  it('parses bullet and ordered lists into items', () => {
    const blocks = parseRichBody('<ul><li>Shoes</li><li><strong>Lunch</strong></li></ul><ol><li>One</li></ol>');
    expect(blocks[0]).toEqual(expect.objectContaining({ type: 'list', ordered: false }));
    const items = (blocks[0] as any).items;
    expect(items).toHaveLength(2);
    expect(runsText(items[0])).toBe('Shoes');
    expect(items[1][0]).toEqual(expect.objectContaining({ text: 'Lunch', bold: true }));
    expect(blocks[1]).toEqual(expect.objectContaining({ type: 'list', ordered: true }));
  });

  it('parses blockquote, pre, and hr', () => {
    const blocks = parseRichBody('<blockquote><p>Be kind.</p></blockquote><hr><pre>code here</pre>');
    expect(blocks[0].type).toBe('quote');
    expect(runsText((blocks[0] as any).runs)).toBe('Be kind.');
    expect(blocks[1].type).toBe('rule');
    expect(blocks[2]).toEqual(expect.objectContaining({ type: 'pre', text: 'code here' }));
  });

  it('carries link hrefs on runs, dropping unsafe protocols', () => {
    const blocks = parseRichBody(
      '<p><a href="https://x.test/page">the form</a> and <a href="javascript:alert(1)">bad</a></p>',
    );
    const runs = (blocks[0] as any).runs;
    expect(runs[0]).toEqual(expect.objectContaining({ text: 'the form', href: 'https://x.test/page' }));
    expect(runs[2].href).toBeUndefined();
  });

  it('turns <br> into a newline within the paragraph', () => {
    const blocks = parseRichBody('<p>One<br>Two</p>');
    expect(runsText((blocks[0] as any).runs)).toBe('One\nTwo');
  });

  it('strips unknown tags but keeps their text (pre-sanitizer rows)', () => {
    const blocks = parseRichBody('<p><span style="x">kept</span> <script>alert(1)</script>text</p>');
    // script CONTENT is dropped entirely; span content survives.
    expect(runsText((blocks[0] as any).runs)).toBe('kept text');
  });

  it('decodes entities in runs', () => {
    const blocks = parseRichBody('<p>Macaroni &amp; cheese</p>');
    expect(runsText((blocks[0] as any).runs)).toBe('Macaroni & cheese');
  });

  it('skips empty paragraphs (an empty editor emits <p></p>)', () => {
    expect(parseRichBody('<p></p>')).toHaveLength(0);
    expect(parseRichBody('')).toHaveLength(0);
  });

  it('wraps bare inline content in a paragraph', () => {
    const blocks = parseRichBody('before <strong>bold</strong> after');
    expect(blocks).toHaveLength(1);
    expect(runsText((blocks[0] as any).runs)).toBe('before bold after');
  });
});
