import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * react-helmet-async APPENDS meta tags; it does not replace matching ones that
 * were already in the document. Verified: with a static og:title in index.html
 * and a Helmet og:title on the page, the head ends up holding BOTH, static
 * first. OG parsers and Google take the first occurrence, so any static default
 * for a property a page also sets silently shadows the per-page value.
 *
 * That is the opposite of what defaults are for, and it would undo the
 * per-portfolio titles and descriptions DiplomaPage sets. So index.html may
 * only carry properties that no page overrides.
 */
const HELMET_OWNED = [
  'description',
  'og:title',
  'og:description',
  'og:type',
  'og:url',
  'twitter:title',
  'twitter:description',
]

// Safe: either no page sets them, or every page sets the identical value.
const EXPECTED_DEFAULTS = [
  'og:site_name',
  'og:image',
  'og:image:width',
  'og:image:height',
  'twitter:card',
  'twitter:image',
]

const html = fs.readFileSync(
  path.resolve(__dirname, '../../index.html'),
  'utf8'
)

const declared = [...html.matchAll(/<meta\s+(?:property|name)="([^"]+)"/g)].map(
  (m) => m[1]
)

describe('index.html social defaults', () => {
  it('ships the defaults a scraper needs', () => {
    for (const tag of EXPECTED_DEFAULTS) {
      expect(declared, `index.html should declare ${tag}`).toContain(tag)
    }
  })

  it('declares nothing Helmet also sets, which it would shadow', () => {
    const shadowing = HELMET_OWNED.filter((tag) => declared.includes(tag))
    expect(
      shadowing,
      'These are set per-page by Helmet. A static copy here comes FIRST in the '
        + 'head and wins, replacing the real title/description with the generic '
        + 'one on every shared link. Remove them from index.html.'
    ).toEqual([])
  })

  it('points og:image at an absolute URL (scrapers cannot resolve relative)', () => {
    const m = html.match(/<meta property="og:image" content="([^"]+)"/)
    expect(m).not.toBeNull()
    expect(m[1]).toMatch(/^https:\/\//)
  })
})
