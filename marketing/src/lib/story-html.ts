/**
 * A story as one self-contained HTML string, for the RSS feed's
 * content:encoded. Feed readers and answer engines that ingest the feed get
 * the whole story, absolute URLs, no site chrome. Mirrors the section order
 * of src/pages/stories/[slug].astro.
 */
import type { Story } from '../data/stories.schema'
import { SITE } from '../data/site'
import { absolute } from '../data/schema'
import { formatDate, hostnameOf, reviewStats, sectionsByKind, summarySentence, SETTING_LABEL, GRADE_BAND_LABEL, landerFor, storyUrl } from './stories'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const p = (text: string) => `<p>${esc(text)}</p>`

export function storyHtml(story: Story): string {
  const { whatTheyDid, tasks, evidence, criteria, howItWent, whatItCountedFor } = sectionsByKind(story)
  const stats = reviewStats(story)
  const lander = landerFor(story)
  const parts: string[] = []

  parts.push(`<p><strong>${esc(summarySentence(story))}</strong></p>`)
  parts.push(p(story.dek))

  const facts: [string, string][] = [
    ['Student', story.student.label],
    ['Setting', SETTING_LABEL[story.student.setting]],
    ['Activity', story.activity.label],
    [story.subject_split.length > 1 ? 'Subjects' : 'Subject', story.subject_split.map((s) => `${s.subject} (${s.xp} XP)`).join(', ') || story.subject],
    ['Credit', story.credit_fraction],
    ['XP', String(story.xp_awarded)],
  ]
  if (story.student.grade_band && !/elementary|middle|high school/i.test(story.student.label)) {
    facts.splice(1, 0, ['Grade band', GRADE_BAND_LABEL[story.student.grade_band]])
  }
  if (story.task_count > 1) facts.push(['Tasks', String(story.task_count)])
  if (stats.rounds > 0) facts.push(['Review rounds', String(stats.rounds)])
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

  if (evidence && evidence.items.length > 0) {
    parts.push('<h2>What the student submitted as evidence</h2>')
    for (const item of evidence.items) {
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
    parts.push('<h2>What the reviewer looked for</h2>')
    parts.push(
      `<ul>${criteria.criteria
        .map((c) => `<li>${esc(c.text)} (${c.verdict === 'met' ? 'Met' : 'Partial'})${c.note ? `: ${esc(c.note)}` : ''}</li>`)
        .join('')}</ul>`
    )
  }

  if (howItWent && howItWent.rounds.length > 0) {
    parts.push('<h2>How the review went</h2>')
    for (const round of howItWent.rounds) {
      parts.push(`<h3>Round ${round.round}: ${esc(round.action)} (${esc(formatDate(round.date))})</h3>`)
      if (round.feedback_verbatim) {
        parts.push(`<p><em>Reviewer feedback, verbatim:</em></p><blockquote>${esc(round.feedback_verbatim)}</blockquote>`)
      }
      if (round.what_changed) parts.push(p(`What changed: ${round.what_changed}`))
    }
  }

  if (whatItCountedFor) {
    parts.push('<h2>What it counted for</h2>')
    parts.push(whatItCountedFor.body_html ?? p(whatItCountedFor.body_md))
  }
  if (lander) {
    parts.push(`<p><a href="${esc(absolute(`/l/${lander.slug}/`))}">${esc(lander.headline)}</a></p>`)
  }

  if (story.faq.length > 0) {
    parts.push('<h2>Questions about this story</h2>')
    for (const f of story.faq) parts.push(`<h3>${esc(f.q)}</h3>${p(f.a)}`)
  }

  parts.push(
    p(`Written by ${story.author.name}, ${story.author.title}, from a real submission reviewed by a licensed Optio teacher. Student details are anonymized.`)
  )
  parts.push(`<p><a href="${esc(absolute(storyUrl(story)))}">Read this story on ${esc(SITE.name)}</a></p>`)

  return parts.join('\n')
}
