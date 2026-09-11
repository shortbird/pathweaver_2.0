/**
 * Generates the per-page Open Graph images (1200x630 PNG) into
 * public/images/og/. Run `npm run og` after adding a page or lander, and
 * commit the PNGs. Keep the LANDERS list in sync with src/data/landers.ts.
 *
 * Story OG images are not listed here: src/pages/images/og/stories/[slug].png.ts
 * renders one per story at build time from the same template.
 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ogSvg } from '../src/lib/og-template.mjs'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'images', 'og')
mkdirSync(outDir, { recursive: true })

const PAGES = [
  { file: 'default', title: 'Real credit for real life', subtitle: 'Optio' },
  { file: 'home', title: 'Real life is the best education.', subtitle: 'Optio makes it count.' },
  { file: 'academy', title: 'Optio Academy', subtitle: 'A WASC-accredited online private school' },
  { file: 'schools', title: 'For Schools', subtitle: 'A registrar-accepted diploma from day one' },
  { file: 'philosophy', title: 'The Process Is The Goal', subtitle: 'The Optio philosophy' },
  { file: 'blog', title: 'The Optio Blog', subtitle: 'Notes on real learning and making it count' },
  { file: 'stories', title: 'Stories', subtitle: 'Real submissions, real credit, reviewer feedback verbatim' },
  // Landers (keep slugs in sync with src/data/landers.ts)
  { file: 'l-piano', title: 'Your piano is a music class.', subtitle: 'First class free' },
  { file: 'l-soccer', title: 'Your soccer season is a PE class.', subtitle: 'First class free' },
  { file: 'l-camp', title: 'Your summer camp is a science class.', subtitle: 'First class free' },
  { file: 'l-art', title: 'Your art is a fine arts class.', subtitle: 'First class free' },
  { file: 'l-coding', title: 'Your game is a computer science class.', subtitle: 'First class free' },
  { file: 'l-volunteering', title: 'Your volunteer work is a civics class.', subtitle: 'First class free' },
]

for (const page of PAGES) {
  await sharp(Buffer.from(ogSvg(page))).png().toFile(join(outDir, `${page.file}.png`))
  console.log(`og: ${page.file}.png`)
}
