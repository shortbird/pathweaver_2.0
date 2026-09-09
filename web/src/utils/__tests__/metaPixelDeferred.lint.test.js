/**
 * The Meta Pixel must not fire from index.html on page load.
 *
 * The SPA trackers only fire for unauthenticated browsing (MetaPixelTracker,
 * GaTracker) because this platform's signed-in users are largely minors and we
 * do not feed children's activity to advertising tools. The base pixel in
 * index.html quietly went around that policy: it fired a PageView on every hard
 * page load, before the app knew who was logged in, so a signed-in student's
 * page load still reached facebook.com carrying their cookie and IP.
 *
 * index.html now only DEFINES window.__optioLoadMetaPixel(); MetaPixelTracker
 * calls it once auth is settled and the visitor is confirmed signed out. This
 * is a source lint rather than a behavioural test because the regression is a
 * one-line edit to a raw HTML file that no component test would ever load.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

describe('index.html Meta Pixel is deferred', () => {
  it('defines the deferred loader', () => {
    expect(html).toMatch(/window\.__optioLoadMetaPixel\s*=/);
  });

  it('does not track a PageView outside the loader', () => {
    // Every fbq('track', ...) in the file must sit inside the loader body,
    // which starts at the assignment above.
    const loaderStart = html.indexOf('window.__optioLoadMetaPixel = function');
    expect(loaderStart).toBeGreaterThan(-1);

    const trackCalls = [...html.matchAll(/fbq\(\s*['"]track['"]/g)];
    expect(trackCalls.length).toBeGreaterThan(0); // the loader still fires one
    for (const match of trackCalls) {
      expect(match.index).toBeGreaterThan(loaderStart);
    }
  });

  it('has no <noscript> tracking pixel', () => {
    // A noscript img cannot be gated on auth state — there is no JS to ask.
    expect(html).not.toMatch(/facebook\.com\/tr/);
    expect(html).not.toMatch(/<noscript>\s*<img/i);
  });
});
