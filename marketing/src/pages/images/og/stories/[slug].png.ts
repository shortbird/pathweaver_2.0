/**
 * /images/og/stories/<slug>.png: one Open Graph card per story, rendered
 * with sharp at build time. A story with a still (its hero image, or the
 * poster frame of its hero video) gets that work on the card; one without
 * gets the same gradient card the hand-listed pages use
 * (src/lib/og-template.mjs). Nothing to commit, nothing to keep in sync.
 *
 * The still is fetched once here and embedded as a data: URI, so a fetch
 * failure falls back to the plain card instead of failing the build.
 */
import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import sharp from 'sharp'
import { ogSvg, ogSvgWithImage } from '../../../../lib/og-template.mjs'
import type { Story } from '../../../../data/stories.schema'
import { heroStill } from '../../../../lib/stories'

export async function getStaticPaths() {
  const entries = await getCollection('stories')
  return entries.map((entry) => ({ params: { slug: entry.id }, props: { story: entry.data } }))
}

async function stillAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    // Resize once so the SVG rasterizes fast and the card never embeds a 1600px original.
    const jpeg = await sharp(buf).resize({ width: 900, height: 630, fit: 'cover' }).jpeg({ quality: 82 }).toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return null
  }
}

export const GET: APIRoute = async ({ props }) => {
  const story = props.story as Story
  const subtitle = `${story.subject} · Optio Stories`
  const still = heroStill(story)
  const href = still ? await stillAsDataUri(still) : null
  const svg = href ? ogSvgWithImage({ title: story.title, subtitle, imageHref: href }) : ogSvg({ title: story.title, subtitle })
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } })
}
