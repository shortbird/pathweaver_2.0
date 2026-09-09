/**
 * iCreate, 2026-09-07 (208b75b5): "my students can't access homework links from
 * the mobile app."
 *
 * The web app has linkified chat messages since a2da7b48; the app rendered the
 * same message as one flat string. These tests pin the split to the same rules
 * the web's splitUrls uses, so a link that is tappable on one surface is
 * tappable on the other and ends in the same place.
 */
import { splitUrls, hasUrl } from '../messageLinks';

describe('splitUrls', () => {
  it('pulls a link out of the sentence around it', () => {
    expect(splitUrls('Homework is at https://classroom.google.com/c/abc today'))
      .toEqual([
        { text: 'Homework is at ' },
        { url: 'https://classroom.google.com/c/abc' },
        { text: ' today' },
      ]);
  });

  it('leaves the full stop with the sentence', () => {
    // "…/abc." is not a URL path; the period ends the teacher's sentence.
    expect(splitUrls('Read https://example.com/abc.'))
      .toEqual([{ text: 'Read ' }, { url: 'https://example.com/abc' }, { text: '.' }]);
  });

  it('finds every link in a message, not just the first', () => {
    const parts = splitUrls('Slides https://a.example/1 and form https://b.example/2');
    expect(parts.filter((p) => p.url).map((p) => p.url))
      .toEqual(['https://a.example/1', 'https://b.example/2']);
  });

  it('handles a message that is nothing but a link', () => {
    expect(splitUrls('https://example.com')).toEqual([{ url: 'https://example.com' }]);
  });

  it('matches only http(s) — a message is untrusted text', () => {
    // javascript:, intent:, file: and friends never become something to tap.
    for (const evil of ['javascript:alert(1)', 'intent://evil#Intent;end', 'file:///etc/passwd']) {
      expect(hasUrl(`look at ${evil}`)).toBe(false);
    }
  });

  it('says a plain message has nothing to tap', () => {
    expect(hasUrl('Bring your sketchbook on Thursday')).toBe(false);
  });

  it('survives an empty message', () => {
    expect(splitUrls('')).toEqual([]);
  });
});
