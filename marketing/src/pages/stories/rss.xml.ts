/**
 * /stories/rss.xml: every published story, newest first, with the whole
 * story in content:encoded so a reader (or an answer engine that ingests
 * feeds) gets the sections and the verbatim feedback as well as the dek.
 * Under STORIES_SOURCE=fixture (never on Render) the fixtures are listed
 * so the feed can be checked locally.
 */
import rss from '@astrojs/rss'
import type { APIContext } from 'astro'
import { getCollection } from 'astro:content'
import { byNewest, listable, storyUrl } from '../../lib/stories'
import { storyHtml } from '../../lib/story-html'

export async function GET(context: APIContext) {
  const stories = listable((await getCollection('stories')).map((e) => e.data)).sort(byNewest)
  return rss({
    title: 'Optio Stories',
    description:
      'Real student work that became accredited credit: what they did, what they submitted, what the reviewer looked for, and what it counted for.',
    site: context.site!,
    items: stories.map((story) => ({
      title: story.title,
      description: story.dek,
      pubDate: story.published_at,
      link: storyUrl(story),
      categories: [story.subject, ...story.subject_split.map((s) => s.subject).filter((s) => s !== story.subject)],
      content: storyHtml(story),
    })),
    customData: '<language>en-us</language>',
  })
}
