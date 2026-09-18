/**
 * linkify: the links in a run of typed text, and nothing that is not one.
 */

import { linkify, hasLink } from '../linkify';

describe('linkify', () => {
  it('finds a pasted URL in the middle of a sentence', () => {
    expect(linkify('Sign up HERE: https://forms.gle/abc123 by Friday')).toEqual([
      { text: 'Sign up HERE: ' },
      { text: 'https://forms.gle/abc123', url: 'https://forms.gle/abc123' },
      { text: ' by Friday' },
    ]);
  });

  it('leaves the sentence its full stop', () => {
    expect(linkify('Details at https://example.com/info.')).toEqual([
      { text: 'Details at ' },
      { text: 'https://example.com/info', url: 'https://example.com/info' },
      { text: '.' },
    ]);
  });

  it('keeps a closing paren the link opened, drops one it did not', () => {
    expect(linkify('(see https://example.com/a)')[1]).toEqual({ text: 'https://example.com/a', url: 'https://example.com/a' });
    expect(linkify('https://en.wikipedia.org/wiki/Foo_(bar)')[0].url).toBe('https://en.wikipedia.org/wiki/Foo_(bar)');
  });

  it('gives a bare www. host a scheme to open with', () => {
    expect(linkify('Visit www.optioeducation.com today')[1]).toEqual({
      text: 'www.optioeducation.com', url: 'https://www.optioeducation.com',
    });
  });

  it('does not turn a bare domain in prose into a link', () => {
    expect(linkify('Contact the office.Thanks')).toEqual([{ text: 'Contact the office.Thanks' }]);
    expect(hasLink('no links here')).toBe(false);
  });

  it('handles a string that is only a link, and several links', () => {
    expect(linkify('https://tinyurl.com/iCreatecollab')).toEqual([
      { text: 'https://tinyurl.com/iCreatecollab', url: 'https://tinyurl.com/iCreatecollab' },
    ]);
    expect(linkify('a https://x.com b https://y.com').filter((p) => p.url)).toHaveLength(2);
  });

  it('is empty for nothing', () => {
    expect(linkify('')).toEqual([]);
    expect(linkify(null)).toEqual([]);
  });
});
