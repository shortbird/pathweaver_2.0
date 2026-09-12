/**
 * A story as one self-contained HTML string, for the RSS feed's
 * content:encoded. Feed readers and answer engines that ingest the feed get
 * the whole story, absolute URLs, no site chrome. Mirrors the section order
 * of src/pages/stories/[slug].astro.
 */
import type { Story } from '../data/stories.schema'
import { SITE } from '../data/site'
import { absolute } from '../data/schema'
import { creditExplainer } from '../data/howItWorks'
import { evidenceBesidesHero, heroOf, heroStill, hostnameOf, sectionsByKind, SETTING_LABEL, GRADE_BAND_LABEL, landerFor, storyUrl, xpPerCredit } from './stories'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const p = (text: string) => `<p>${esc(text)}</p>`

export function storyHtml(story: Story): string {
  const { whatTheyDid, tasks, criteria, whatItCountedFor } = sectionsByKind(story)
  const lander = landerFor(story)
  const hero = heroOf(story)
  const still = heroStill(story)
  const parts: string[] = []

  parts.push(`<p><strong>${esc(story.dek)}</strong></p>`)

  // The work first, as on the page. A video is a link (feed readers rarely
  // play inline), with its poster shown when there is one.
  if (hero?.type === 'video') {
    const label = hero.caption || hero.alt || 'Watch the video'
    const poster = still ? `<p><img src="${esc(still)}" alt="${esc(hero.alt ?? '')}" /></p>` : ''
    parts.push(`${poster}<p><a href="${esc(hero.url)}">${esc(label)}</a></p>`)
  } else if (hero) {
    const size = hero.width && hero.height ? ` width="${hero.width}" height="${hero.height}"` : ''
    parts.push(`<figure><img src="${esc(hero.url)}" alt="${esc(hero.alt ?? '')}"${size} />${hero.caption ? `<figcaption>${esc(hero.caption)}</figcaption>` : ''}</figure>`)
  }

  const facts: [string, string][] = []
  if (story.student.label) facts.push(['Student', story.student.label])
  facts.push(['School', SETTING_LABEL[story.student.setting]])
  if (story.student.grade_band) facts.push(['Grade', GRADE_BAND_LABEL[story.student.grade_band]])
  facts.push([story.subject_split.length > 1 ? 'Subjects' : 'Subject', story.subject_split.map((s) => s.subject).join(', ') || story.subject])
  facts.push(['Activity', story.activity.label])
  if (story.task_count > 1) facts.push(['Tasks', String(story.task_count)])
  parts.push(`<ul>${facts.map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`).join('')}</ul>`)

  if (whatTheyDid) {
    parts.push('<h2>What the student did</h2>')
    parts.push(whatTheyDid.body_html ?? p(whatTheyDid.body_md))
  }

  if (tasks && tasks.rows.length > 0) {
    parts.push('<h2>The tasks</h2>')
    parts.push(
      `<ol>${tasks.rows
        .map((row) => `<li>${esc(row.title)}: ${esc(row.subject)}, ${row.xp} XP, ${row.criteria_met} of ${row.criteria_total} criteria met</li>`)
        .join('')}</ol>`
    )
  }

  const more = evidenceBesidesHero(story)
  if (more.length > 0) {
    parts.push(hero ? '<h2>More of the evidence</h2>' : '<h2>What the student submitted as evidence</h2>')
    for (const item of more) {
      if (item.type === 'image' && item.url) {
        const size = item.width && item.height ? ` width="${item.width}" height="${item.height}"` : ''
        parts.push(`<figure><img src="${esc(item.url)}" alt="${esc(item.alt ?? '')}"${size} />${item.caption ? `<figcaption>${esc(item.caption)}</figcaption>` : ''}</figure>`)
      } else if (item.type === 'quote' && item.text) {
        const cite = item.caption ? `<footer><cite>${esc(item.caption)}</cite></footer>` : ''
        parts.push(`<blockquote><p>${esc(item.text)}</p>${cite}</blockquote>`)
      } else if (item.type === 'document' && item.url) {
        const label = item.alt || 'A document the student submitted'
        parts.push(`<p><a href="${esc(item.url)}">${esc(label)} (PDF)</a>${item.caption ? `: ${esc(item.caption)}` : ''}</p>`)
      } else if (item.type === 'link' && item.url) {
        const label = item.alt || hostnameOf(item.url) || item.url
        parts.push(`<p><a href="${esc(item.url)}">${esc(label)}</a>${item.caption ? `: ${esc(item.caption)}` : ''}</p>`)
      } else if (item.type === 'video' && item.url) {
        const label = item.caption || item.alt || 'Watch the video'
        parts.push(`<p><a href="${esc(item.url)}">${esc(label)}</a></p>`)
      }
    }
  }

  if (criteria && criteria.criteria.length > 0) {
    parts.push('<h2>What the teacher checked</h2>')
    parts.push(
      `<ul>${criteria.criteria
        .map((c) => `<li>${esc(c.text)} (${c.verdict === 'met' ? 'Met' : 'Partial'})${c.note ? `: ${esc(c.note)}` : ''}</li>`)
        .join('')}</ul>`
    )
  }

  parts.push('<h2>What it counted for</h2>')
  if (whatItCountedFor) {
    parts.push(whatItCountedFor.body_html ?? p(whatItCountedFor.body_md))
  }
  parts.push(p(creditExplainer(xpPerCredit(story))))
  parts.push(p(`${story.receipt.activity}: ${story.receipt.course}, ${story.receipt.credit}, earned.`))
  if (lander) {
    parts.push(`<p><a href="${esc(absolute(`/l/${lander.slug}/`))}">${esc(lander.headline)}</a></p>`)
  }

  if (story.faq.length > 0) {
    parts.push('<h2>Questions about this story</h2>')
    for (const f of story.faq) parts.push(`<h3>${esc(f.q)}</h3>${p(f.a)}`)
  }

  parts.push(
    p(`Written by ${story.author.name}, ${story.author.title}, from a real submission reviewed by a licensed Optio teacher. Student details are anonymized unless a family has recorded consent.`)
  )
  parts.push(`<p><a href="${esc(absolute(storyUrl(story)))}">Read this story on ${esc(SITE.name)}</a></p>`)

  return parts.join('\n')
}
