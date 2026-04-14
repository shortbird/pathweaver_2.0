/**
 * @jest-environment jsdom
 *
 * C3 regression: lesson HTML must be sanitized before rendering.
 *
 * Lesson content is authored by admins/org_admins, but a compromised admin
 * account or a stored XSS in the curriculum builder would otherwise reach
 * student browsers via dangerouslySetInnerHTML. These tests lock in the
 * DOMPurify invariant. jsdom env required so DOMPurify can bind to a window.
 */
import { sanitizeLessonHtml } from '../sanitizeLessonHtml';

describe('sanitizeLessonHtml — XSS defense for lesson content', () => {
  it('strips <script> tags', () => {
    const dirty = '<p>Hello</p><script>alert("xss")</script>';
    const clean = sanitizeLessonHtml(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/alert/);
    expect(clean).toContain('<p>Hello</p>');
  });

  it('strips inline event handlers (onclick, onerror, onload)', () => {
    const dirty = '<img src="x" onerror="alert(1)"><a href="#" onclick="alert(2)">link</a>';
    const clean = sanitizeLessonHtml(dirty);
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/alert/);
  });

  it('strips javascript: URLs', () => {
    const dirty = '<a href="javascript:alert(1)">click</a>';
    const clean = sanitizeLessonHtml(dirty);
    expect(clean).not.toMatch(/javascript:/i);
  });

  it('strips <iframe> tags by default (DOMPurify default policy)', () => {
    const dirty = '<iframe src="https://evil.example.com"></iframe><p>ok</p>';
    const clean = sanitizeLessonHtml(dirty);
    expect(clean).not.toMatch(/<iframe/i);
    expect(clean).toContain('<p>ok</p>');
  });

  it('preserves benign formatting tags', () => {
    const dirty = '<p>Hello <strong>world</strong> <em>!</em></p><ul><li>one</li><li>two</li></ul>';
    const clean = sanitizeLessonHtml(dirty);
    expect(clean).toContain('<strong>world</strong>');
    expect(clean).toContain('<em>!</em>');
    expect(clean).toContain('<li>one</li>');
  });

  it('handles empty input safely', () => {
    expect(sanitizeLessonHtml('')).toBe('');
  });
});
