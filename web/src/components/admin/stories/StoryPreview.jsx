import React from 'react'
import DocsMarkdown from '../../docs/DocsMarkdown'
import { SECTION_ORDER, SECTION_TITLES, sectionByKind, GRADE_BAND_OPTIONS, SETTING_OPTIONS } from './storyEditorState'

const isIncluded = (row) => row?.included !== false

const optionLabel = (options, value) => options.find(o => o.value === value)?.label || value

const Facts = ({ story }) => {
  const facts = [
    ['Student', story.student_label],
    ['Setting', optionLabel(SETTING_OPTIONS, story.setting)],
    ['Grade band', optionLabel(GRADE_BAND_OPTIONS, story.grade_band)],
    ['Activity', story.activity_label || story.activity_slug],
    ['Subject', story.subject],
    ['Credit', story.credit_fraction],
    ['XP', story.xp_awarded],
  ].filter(([, v]) => v != null && v !== '')
  if (facts.length === 0) return null
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {facts.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-gray-500">{k}</dt>
          <dd className="text-gray-900">{String(v)}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

const Receipt = ({ receipt }) => {
  if (!receipt) return null
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
      <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Receipt</p>
      <p className="font-medium text-gray-900">{receipt.activity}</p>
      <p className="text-gray-700">{[receipt.course, receipt.credit].filter(Boolean).join(' · ')}</p>
      {receipt.icon && <p className="text-xs text-gray-400 mt-1">icon: {receipt.icon}</p>}
    </div>
  )
}

const Section = ({ title, children }) => (
  <section className="space-y-3">
    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    {children}
  </section>
)

/**
 * The story as the page will show it, in the order the page shows it.
 *
 * A preview that reordered or dropped a section would let an editor sign
 * off on something other than what ships, so this walks SECTION_ORDER and
 * renders whatever is there. Markdown goes through DocsMarkdown, the same
 * renderer the help center uses, so headings and lists look the way an
 * editor already expects.
 */
const StoryPreview = ({ story, assets = [] }) => {
  if (!story) return null
  const images = assets.filter(a => a.included)
  const hero = images.find(a => a.id === story.hero_asset_id) || null

  const renderSection = (kind) => {
    const section = sectionByKind(story, kind)
    if (!section) return null
    switch (kind) {
      case 'what_they_did':
      case 'what_it_counted_for':
        if (!section.body_md) return null
        return (
          <Section key={kind} title={SECTION_TITLES[kind]}>
            <DocsMarkdown content={section.body_md} />
          </Section>
        )
      case 'tasks': {
        const rows = (section.rows || []).filter(isIncluded)
        if (rows.length === 0) return null
        return (
          <Section key={kind} title={SECTION_TITLES[kind]}>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
              {rows.map((row, i) => (
                <li key={i}>
                  <span className="font-medium text-gray-900">{row.title}</span>
                  {row.subject && <span className="text-gray-500"> · {row.subject}</span>}
                  {row.xp != null && <span className="text-gray-500"> · {row.xp} XP</span>}
                </li>
              ))}
            </ol>
          </Section>
        )
      }
      case 'evidence': {
        const items = (section.items || []).filter(item => item?.type !== 'image')
        if (images.length === 0 && items.length === 0) return null
        return (
          <Section key={kind} title={SECTION_TITLES[kind]}>
            {images.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {images.map(a => (
                  <figure key={a.id} className="space-y-1">
                    {a.thumb_url && (
                      <img src={a.thumb_url} alt={a.alt || ''} className="w-full rounded-lg border border-gray-200 object-cover" />
                    )}
                    {a.caption && <figcaption className="text-xs text-gray-500">{a.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
            {items.map((item, i) => (
              item.type === 'quote' ? (
                <blockquote key={i} className="border-l-4 border-optio-purple pl-4 text-gray-700 italic">
                  {item.text || item.caption}
                </blockquote>
              ) : (
                <p key={i} className="text-sm text-gray-700">
                  {item.caption || item.alt || item.url}
                </p>
              )
            ))}
          </Section>
        )
      }
      case 'what_reviewer_looked_for': {
        const rows = (section.criteria || []).filter(isIncluded)
        if (rows.length === 0) return null
        return (
          <Section key={kind} title={SECTION_TITLES[kind]}>
            <ul className="space-y-1 text-sm text-gray-700">
              {rows.map((row, i) => (
                <li key={i}>
                  <span className={row.verdict === 'met' ? 'text-emerald-700' : 'text-amber-700'}>
                    {row.verdict === 'met' ? 'Met' : 'Partly met'}
                  </span>
                  {' '}{row.text}
                  {row.note && <span className="text-gray-500"> · {row.note}</span>}
                </li>
              ))}
            </ul>
          </Section>
        )
      }
      case 'how_it_went': {
        const rows = (section.rounds || []).filter(isIncluded)
        if (rows.length === 0) return null
        return (
          <Section key={kind} title={SECTION_TITLES[kind]}>
            <ol className="space-y-3 text-sm">
              {rows.map((row, i) => (
                <li key={i} className="space-y-1">
                  <p className="text-xs text-gray-500">
                    {[row.round != null && `Round ${row.round}`, row.date && new Date(row.date).toLocaleDateString(), row.action]
                      .filter(Boolean).join(' · ')}
                  </p>
                  {row.feedback_verbatim && (
                    <blockquote className="border-l-2 border-gray-200 pl-3 text-gray-700 whitespace-pre-wrap">
                      {row.feedback_verbatim}
                    </blockquote>
                  )}
                  {row.what_changed && <p className="text-gray-700">{row.what_changed}</p>}
                </li>
              ))}
            </ol>
          </Section>
        )
      }
      default:
        return null
    }
  }

  const faq = (story.faq || []).filter(row => row?.q || row?.a)

  return (
    <article className="space-y-6" aria-label="Story preview">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">{story.title || 'Untitled story'}</h1>
        {story.dek && <p className="text-gray-600">{story.dek}</p>}
        <p className="text-xs text-gray-400">
          By {story.author_name || 'Dr. Tanner Bowman'} · reviewed by a licensed Optio teacher
        </p>
      </header>

      {hero?.thumb_url && (
        <img src={hero.thumb_url} alt={hero.alt || ''} className="w-full rounded-xl border border-gray-200 object-cover" />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Receipt receipt={story.receipt} />
        <Facts story={story} />
      </div>

      {SECTION_ORDER.map(renderSection)}

      {faq.length > 0 && (
        <Section title="Questions">
          {faq.map((row, i) => (
            <details key={i} className="rounded-lg border border-gray-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-gray-900">{row.q}</summary>
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{row.a}</p>
            </details>
          ))}
        </Section>
      )}
    </article>
  )
}

export default StoryPreview
