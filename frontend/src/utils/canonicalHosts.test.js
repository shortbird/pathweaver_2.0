import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const SRC = path.resolve(__dirname, '..')

/**
 * The SPA serves app.optioeducation.com. Since the 2026-09-01 cutover, www 301s
 * every one of these paths BACK to app, so a canonical or og:url written as a
 * literal www URL points at a redirect to the page that declared it. Google
 * responds by discarding the declared canonical and choosing its own. Use
 * canonicalUrl() from utils/canonicalUrl.js instead - it names the serving host.
 *
 * EXEMPT: src/pages/marketing/. Those are the pre-cutover marketing pages, now
 * duplicated by the real Astro pages on www and blocked in public/robots.txt.
 * Their canonicals point off-host at the live www versions, which is correct
 * for a duplicate. They are dead routes awaiting the "Post-cutover cleanup"
 * item in marketing/DEPLOYMENT.md; when they go, drop this exemption with them.
 */
const EXEMPT = ['pages/marketing/']

function jsxFiles(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) {
      if (name !== 'node_modules') jsxFiles(full, acc)
    } else if (/\.(jsx?|tsx?)$/.test(name)) {
      acc.push(full)
    }
  }
  return acc
}

describe('canonical URLs name the serving host', () => {
  it('has no hardcoded www canonical or og:url outside the dead marketing pages', () => {
    const offenders = []

    for (const file of jsxFiles(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/')
      if (EXEMPT.some((prefix) => rel.startsWith(prefix))) continue

      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const isCanonicalTag =
            line.includes('rel="canonical"') || line.includes('og:url')
          if (isCanonicalTag && line.includes('www.optioeducation.com')) {
            offenders.push(`${rel}:${i + 1}`)
          }
        })
    }

    expect(offenders).toEqual([])
  })
})
