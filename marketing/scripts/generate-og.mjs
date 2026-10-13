/**
 * Generates the per-page Open Graph images (1200x630 PNG) into
 * public/images/og/. Run `npm run og` after adding a page or lander, and
 * commit the PNGs. Keep the LANDERS list in sync with src/data/landers.ts.
 *
 * Story OG images are not listed here: src/pages/images/og/stories/[slug].png.ts
 * renders one per story at build time from the same template.
 */
import sharp from 'sharp'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ogSvg } from '../src/lib/og-template.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'images', 'og')
mkdirSync(outDir, { recursive: true })

/**
 * One price from PRICE_TEXT in src/data/pricing.generated.ts, which is
 * generated from shared/data/pricing.json. Read from the generated file
 * because it lives inside marketing/ (the Render root directory), while
 * shared/ sits outside it. A plain node script cannot import .ts, so match
 * the line by regex and fail loudly rather than print a stale price.
 */
function priceText(key) {
  const src = readFileSync(join(here, '..', 'src', 'data', 'pricing.generated.ts'), 'utf8')
  const m = src.match(new RegExp(`"${key}":\\s*"([^"]+)"`))
  if (!m) throw new Error(`generate-og: PRICE_TEXT.${key} not found in pricing.generated.ts`)
  return m[1]
}
const MONTHLY = `${priceText('academyTuitionMonthly')} a month`

const PAGES = [
  { file: 'default', title: 'Real credit for real life', subtitle: 'Optio' },
  { file: 'home', title: 'Real life is the best education.', subtitle: 'Optio makes it count.' },
  { file: 'academy', title: 'Optio Academy', subtitle: 'A WASC-accredited online high school' },
  { file: 'schools', title: 'For Schools', subtitle: 'A registrar-accepted diploma from day one' },
  { file: 'philosophy', title: 'The Process Is The Goal', subtitle: 'The Optio philosophy' },
  { file: 'blog', title: 'The Optio Blog', subtitle: 'Notes on real learning and making it count' },
  { file: 'stories', title: 'Stories', subtitle: 'Real submissions, real credit, reviewer feedback verbatim' },
  // Landers (keep slugs in sync with src/data/landers.ts)
  { file: 'l-piano', title: 'Your piano is a music class.', subtitle: MONTHLY },
  { file: 'l-soccer', title: 'Your soccer season is a PE class.', subtitle: MONTHLY },
  { file: 'l-camp', title: 'Your summer camp is a science class.', subtitle: MONTHLY },
  { file: 'l-art', title: 'Your art is a fine arts class.', subtitle: MONTHLY },
  { file: 'l-coding', title: 'Your game is a computer science class.', subtitle: MONTHLY },
  { file: 'l-volunteering', title: 'Your volunteer work is a civics class.', subtitle: MONTHLY },
]

for (const page of PAGES) {
  await sharp(Buffer.from(ogSvg(page))).png().toFile(join(outDir, `${page.file}.png`))
  console.log(`og: ${page.file}.png`)
}
