/**
 * Generates the per-page Open Graph images (1200x630 PNG) into
 * public/images/og/. Run `npm run og` after adding a page or lander, and
 * commit the PNGs. Keep the LANDERS list in sync with src/data/landers.ts.
 */
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'images', 'og')
mkdirSync(outDir, { recursive: true })

const PAGES = [
  { file: 'default', title: 'Real credit for real life', subtitle: 'Optio' },
  { file: 'home', title: 'Real life is the best education.', subtitle: 'Optio makes it count.' },
  { file: 'academy', title: 'Optio Academy', subtitle: 'A WASC-accredited online private school' },
  { file: 'schools', title: 'For Schools', subtitle: 'A registrar-accepted diploma from day one' },
  { file: 'philosophy', title: 'The Process Is The Goal', subtitle: 'The Optio philosophy' },
  { file: 'blog', title: 'The Optio Blog', subtitle: 'Notes on real learning and making it count' },
  // Landers (keep slugs in sync with src/data/landers.ts)
  { file: 'l-piano', title: 'Your piano is a music class.', subtitle: 'First class free' },
  { file: 'l-soccer', title: 'Your soccer season is a PE class.', subtitle: 'First class free' },
  { file: 'l-camp', title: 'Your summer camp is a science class.', subtitle: 'First class free' },
  { file: 'l-art', title: 'Your art is a fine arts class.', subtitle: 'First class free' },
  { file: 'l-coding', title: 'Your game is a computer science class.', subtitle: 'First class free' },
  { file: 'l-volunteering', title: 'Your volunteer work is a civics class.', subtitle: 'First class free' },
]

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Wrap the title onto up to three lines that fit the canvas.
function wrap(text, max = 24) {
  const words = text.split(' ')
  const lines = ['']
  for (const w of words) {
    const cur = lines[lines.length - 1]
    if ((cur + ' ' + w).trim().length > max && cur) lines.push(w)
    else lines[lines.length - 1] = (cur + ' ' + w).trim()
  }
  return lines.slice(0, 3)
}

for (const page of PAGES) {
  const lines = wrap(page.title)
  const fontSize = lines.some((l) => l.length > 20) ? 64 : 76
  const lineHeight = fontSize * 1.18
  const startY = 315 - ((lines.length - 1) * lineHeight) / 2

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6D469B"/>
      <stop offset="100%" stop-color="#EF597B"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="80" y="110" font-family="Poppins, Helvetica, Arial, sans-serif" font-size="34" font-weight="600" fill="rgba(255,255,255,0.85)">Optio</text>
  ${lines
    .map(
      (line, i) =>
        `<text x="80" y="${startY + i * lineHeight}" font-family="Poppins, Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff">${esc(line)}</text>`
    )
    .join('\n  ')}
  <text x="80" y="545" font-family="Poppins, Helvetica, Arial, sans-serif" font-size="32" font-weight="500" fill="rgba(255,255,255,0.85)">${esc(page.subtitle)}</text>
</svg>`

  await sharp(Buffer.from(svg)).png().toFile(join(outDir, `${page.file}.png`))
  console.log(`og: ${page.file}.png`)
}
