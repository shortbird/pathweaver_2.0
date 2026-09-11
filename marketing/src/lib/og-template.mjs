/**
 * The Open Graph card as an SVG string (1200x630, brand gradient, title on
 * up to three lines, subtitle). Shared by scripts/generate-og.mjs, which
 * writes the hand-listed pages into public/images/og/, and by
 * src/pages/images/og/stories/[slug].png.ts, which renders one per story at
 * build time. Plain .mjs so both Node and Vite can import it unchanged.
 */

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Wrap the title onto up to three lines that fit the canvas. A title that
// needs a fourth line is cut with an ellipsis on the third.
export function wrap(text, max = 24, maxLines = 3) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = ['']
  for (const w of words) {
    const cur = lines[lines.length - 1]
    if ((cur + ' ' + w).trim().length > max && cur) lines.push(w)
    else lines[lines.length - 1] = (cur + ' ' + w).trim()
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[.,;:]?$/, '') + '...'
    return kept
  }
  return lines
}

export function ogSvg({ title, subtitle }) {
  const lines = wrap(title)
  const fontSize = lines.some((l) => l.length > 20) ? 64 : 76
  const lineHeight = fontSize * 1.18
  const startY = 315 - ((lines.length - 1) * lineHeight) / 2
  const font = 'Poppins, Helvetica, Arial, sans-serif'

  return `<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6D469B"/>
      <stop offset="100%" stop-color="#EF597B"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <text x="80" y="110" font-family="${font}" font-size="34" font-weight="600" fill="rgba(255,255,255,0.85)">Optio</text>
  ${lines
    .map(
      (line, i) =>
        `<text x="80" y="${startY + i * lineHeight}" font-family="${font}" font-size="${fontSize}" font-weight="700" fill="#ffffff">${esc(line)}</text>`
    )
    .join('\n  ')}
  <text x="80" y="545" font-family="${font}" font-size="32" font-weight="500" fill="rgba(255,255,255,0.85)">${esc(subtitle)}</text>
</svg>`
}
