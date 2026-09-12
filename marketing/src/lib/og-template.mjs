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

/**
 * The story card with the student's work behind the title: the hero still
 * (or a video's poster) as the right two thirds of the canvas, the gradient
 * band with the title on the left. `imageHref` is a data: URI so sharp can
 * rasterize the SVG without a network fetch.
 */
export function ogSvgWithImage({ title, subtitle, imageHref }) {
  const lines = wrap(title, 17, 3)
  const fontSize = lines.some((l) => l.length > 14) ? 50 : 58
  const lineHeight = fontSize * 1.18
  const startY = 300 - ((lines.length - 1) * lineHeight) / 2
  const font = 'Poppins, Helvetica, Arial, sans-serif'
  const bandWidth = 640

  return `<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6D469B"/>
      <stop offset="100%" stop-color="#EF597B"/>
    </linearGradient>
    <linearGradient id="fade" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6D469B" stop-opacity="1"/>
      <stop offset="100%" stop-color="#6D469B" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <image x="${bandWidth - 120}" y="0" width="${OG_WIDTH - bandWidth + 120}" height="${OG_HEIGHT}" preserveAspectRatio="xMidYMid slice" xlink:href="${imageHref}"/>
  <rect x="${bandWidth - 120}" y="0" width="160" height="${OG_HEIGHT}" fill="url(#fade)"/>
  <rect width="${bandWidth - 120}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <text x="64" y="100" font-family="${font}" font-size="30" font-weight="600" fill="rgba(255,255,255,0.85)">Optio</text>
  ${lines
    .map(
      (line, i) =>
        `<text x="64" y="${startY + i * lineHeight}" font-family="${font}" font-size="${fontSize}" font-weight="700" fill="#ffffff">${esc(line)}</text>`
    )
    .join('\n  ')}
  <text x="64" y="555" font-family="${font}" font-size="26" font-weight="500" fill="rgba(255,255,255,0.85)">${esc(subtitle)}</text>
</svg>`
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
