import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('./dist/', import.meta.url))

/**
 * Runs once per URL after the build has written dist/. Two jobs:
 *   1. Drop any page that rendered a noindex robots meta (fixtures, 404).
 *      Listing a noindex URL in the sitemap is a contradiction Google
 *      flags in Search Console.
 *   2. Set <lastmod> from article:modified_time when the page emitted one
 *      (blog posts and stories do, via Base.astro). Pages without it get no
 *      lastmod; a fake one on every URL teaches crawlers to ignore it.
 * A page whose HTML cannot be read is passed through unchanged.
 */
function serialize(item) {
  let html
  try {
    const pathname = decodeURIComponent(new URL(item.url).pathname)
    html = readFileSync(join(DIST, pathname, 'index.html'), 'utf8')
  } catch {
    return item
  }
  if (/name="robots" content="noindex/.test(html)) return undefined
  const modified = html.match(/property="article:modified_time" content="([^"]+)"/)
  if (modified) item.lastmod = modified[1]
  return item
}

// https://astro.build/config
export default defineConfig({
  site: 'https://www.optioeducation.com',
  integrations: [sitemap({ serialize })],
  image: {
    // Remote images astro:assets may download and optimize at build time:
    // the site-assets bucket (screenshots) and the story-assets bucket.
    domains: ['auth.optioeducation.com', 'vvfgxcykxjybtvpfzwyx.supabase.co'],
  },
  build: {
    // Small stylesheets inline into the page head; keeps request count down
    // for Lighthouse without bloating every page.
    inlineStylesheets: 'auto',
  },
})
