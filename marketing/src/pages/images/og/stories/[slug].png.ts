/**
 * /images/og/stories/<slug>.png: one Open Graph card per story, rendered
 * with sharp at build time from the same SVG template the hand-listed pages
 * use (src/lib/og-template.mjs). Nothing to commit, nothing to keep in sync.
 */
import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import sharp from 'sharp'
import { ogSvg } from '../../../../lib/og-template.mjs'
import type { Story } from '../../../../data/stories.schema'

export async function getStaticPaths() {
  const entries = await getCollection('stories')
  return entries.map((entry) => ({ params: { slug: entry.id }, props: { story: entry.data } }))
}

export const GET: APIRoute = async ({ props }) => {
  const story = props.story as Story
  const svg = ogSvg({
    title: story.title,
    subtitle: `${story.subject} · ${story.credit_fraction} · Optio Stories`,
  })
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } })
}
