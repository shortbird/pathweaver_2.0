import React, { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams } from 'react-router-dom'
import ModalOverlay from '../../components/ui/ModalOverlay'
import { getPoeShowcase } from './poeService'

// Read-only overview of everything the 2026 Pipe Organ Encounter campers
// documented on Optio, shared with POE/AGO leadership. No sign-in: leadership
// have no Optio accounts, so the page is gated on the ?key= link token instead
// (see backend/routes/poe.py). Blocks a camper or family marked private never
// reach this page, and campers are named "First L." rather than in full.
//
// Deliberately renders without the app or marketing chrome — this is a document
// somebody will read start-to-finish and probably print, not a page to navigate
// away from.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const formatDateRange = (start, end) => {
  if (!start) return null
  const [sy, sm, sd] = start.split('-').map(Number)
  if (!sy || !sm || !sd) return null
  if (!end) return `${MONTHS[sm - 1]} ${sd}, ${sy}`
  const [ey, em, ed] = end.split('-').map(Number)
  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${sd}–${ed}, ${sy}`
  if (sy === ey) return `${MONTHS[sm - 1]} ${sd} – ${MONTHS[em - 1]} ${ed}, ${sy}`
  return `${MONTHS[sm - 1]} ${sd}, ${sy} – ${MONTHS[em - 1]} ${ed}, ${ey}`
}

const formatDay = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

const Stat = ({ value, label, sub }) => (
  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-center">
    <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-optio-purple to-optio-pink tabular-nums">
      {value.toLocaleString()}
    </div>
    <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
    {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
  </div>
)

// Photos read as a contact sheet: a tight grid of squares that opens full-size
// on click. Captions are the camper's own words about the shot, so they stay.
// The grid loads `thumb_url` (a 640px transform) — 195 original phone photos
// on one page is several hundred megabytes.
const ImageBlock = ({ items, onOpen }) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
    {items.map((item, i) => (
      <figure key={i} className="min-w-0">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="block w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-optio-purple"
        >
          <img
            src={item.thumb_url || item.url}
            alt={item.caption || item.title || 'Camper evidence photo'}
            loading="lazy"
            className="aspect-square w-full object-cover transition hover:opacity-90"
          />
        </button>
        {item.caption && (
          <figcaption className="mt-1 text-xs leading-snug text-gray-500">{item.caption}</figcaption>
        )}
      </figure>
    ))}
  </div>
)

const VideoBlock = ({ items }) => (
  <div className="grid gap-3 sm:grid-cols-2">
    {items.map((item, i) => (
      <figure key={i} className="min-w-0">
        <video
          src={item.url}
          controls
          preload="metadata"
          className="w-full rounded-lg border border-gray-200 bg-black"
        />
        {(item.caption || item.title) && (
          <figcaption className="mt-1 text-xs leading-snug text-gray-500">
            {item.caption || item.title}
          </figcaption>
        )}
      </figure>
    ))}
  </div>
)

const FileBlock = ({ items, icon }) => (
  <div className="flex flex-wrap gap-2">
    {items.map((item, i) => (
      <a
        key={i}
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:border-optio-purple hover:text-optio-purple"
      >
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
        </svg>
        <span className="truncate max-w-[16rem]">{item.caption || item.title || item.url}</span>
      </a>
    ))}
  </div>
)

const DOC_ICON = 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
const LINK_ICON = 'M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m4.5-4.5l1.5-1.5a4 4 0 015.656 5.656l-3 3a4 4 0 01-5.656 0'

const Block = ({ block, onOpen }) => {
  if (block.type === 'text') {
    return <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700">{block.text}</p>
  }
  if (block.type === 'image') return <ImageBlock items={block.items} onOpen={onOpen} />
  if (block.type === 'video') return <VideoBlock items={block.items} />
  if (block.type === 'document') return <FileBlock items={block.items} icon={DOC_ICON} />
  if (block.type === 'link') return <FileBlock items={block.items} icon={LINK_ICON} />
  return null
}

const Participant = ({ participant, onOpen }) => (
  <article className="break-inside-avoid rounded-2xl border border-gray-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100 px-5 py-4">
      <h3 className="text-lg font-semibold text-gray-900">{participant.name}</h3>
      <span className="text-sm text-gray-500">
        {participant.days.length} {participant.days.length === 1 ? 'day' : 'days'} documented
      </span>
      {participant.credit_awarded && (
        <span className="ml-auto rounded-full bg-optio-purple/10 px-2.5 py-1 text-xs font-semibold text-optio-purple">
          0.5 fine arts credit awarded
        </span>
      )}
    </header>
    <div className="divide-y divide-gray-100">
      {participant.days.map((day, i) => (
        <section key={i} className="px-5 py-4">
          <div className="mb-3 flex items-baseline gap-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-900">{day.title}</h4>
            {formatDay(day.completed_at) && (
              <span className="text-xs text-gray-400">{formatDay(day.completed_at)}</span>
            )}
          </div>
          <div className="space-y-3">
            {day.blocks.map((block, j) => (
              <Block key={j} block={block} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </div>
  </article>
)

// ModalOverlay rather than a hand-rolled `fixed inset-0` backdrop: it portals to
// document.body, so a transformed ancestor can't capture the fixed positioning
// (src/tests/modalPortalGuard.test.js enforces this). It also brings Escape-to-
// close and the body scroll lock. `!bg-black/80` overrides its default 50%
// scrim — photos read better against a darker one.
const Lightbox = ({ item, onClose }) => (
  <ModalOverlay onClose={onClose} className="!bg-black/80">
    <div className="relative max-h-full max-w-5xl" role="dialog" aria-modal="true">
      <img src={item.url} alt={item.caption || item.title || ''} className="max-h-[85vh] w-auto rounded-lg" />
      {(item.caption || item.title) && (
        <p className="mt-2 text-center text-sm text-white/80">{item.caption || item.title}</p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
        aria-label="Close"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </ModalOverlay>
)

const PoeShowcasePage = () => {
  const [searchParams] = useSearchParams()
  const key = searchParams.get('key') || ''

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const result = await getPoeShowcase(key)
        if (!cancelled) setData(result)
      } catch (err) {
        if (!cancelled) setError(err?.response?.status === 404 ? 'not_found' : 'failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [key])

  const totals = data?.totals
  const cohorts = data?.cohorts || []

  const stats = useMemo(() => {
    if (!totals) return []
    return [
      {
        value: totals.participants_with_evidence,
        label: 'Campers documenting',
        sub: `of ${totals.participants} enrolled`,
      },
      { value: totals.cohorts, label: 'POE sites' },
      { value: totals.days_documented, label: 'Camp days logged' },
      { value: totals.reflections, label: 'Written reflections' },
      { value: totals.words, label: 'Words written' },
      { value: totals.photos, label: 'Photos' },
      { value: totals.videos, label: 'Videos' },
      { value: totals.credits_awarded, label: 'Credits awarded', sub: '0.5 fine arts each' },
    ]
  }, [totals])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-optio-purple" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-900">This page isn't available</h1>
          <p className="mt-2 text-gray-600">
            {error === 'not_found'
              ? 'The link may have expired or been mistyped. Ask Optio for a current link.'
              : 'Something went wrong loading the page. Please try again.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>Pipe Organ Encounter 2026 on Optio</title>
        {/* A link-keyed page about minors has no business in a search index. */}
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="bg-gradient-to-r from-optio-purple to-optio-pink px-6 py-12 text-white print:bg-none print:text-gray-900">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-medium uppercase tracking-widest text-white/80 print:text-gray-500">
            Optio · Summer 2026 pilot
          </p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Pipe Organ Encounter 2026</h1>
          <p className="mt-3 max-w-2xl text-white/90 print:text-gray-600">
            What campers documented on Optio during their POE week — their own photos, videos and
            written reflections, day by day, and the fine arts credit that came out of it.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => <Stat key={s.label} value={s.value} label={s.label} sub={s.sub} />)}
        </section>

        {cohorts.length > 1 && (
          <nav className="mt-8 flex flex-wrap gap-2">
            {cohorts.map((c) => (
              <a
                key={c.slug}
                href={`#${c.slug}`}
                className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:border-optio-purple hover:text-optio-purple"
              >
                {c.display_name}
              </a>
            ))}
          </nav>
        )}

        {cohorts.map((cohort) => (
          <section key={cohort.slug} id={cohort.slug} className="mt-12 scroll-mt-6">
            <div className="border-b-2 border-gray-900 pb-3">
              <h2 className="text-2xl font-bold text-gray-900">{cohort.display_name}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {[formatDateRange(cohort.start_date, cohort.end_date),
                  `${cohort.participants.length} ${cohort.participants.length === 1 ? 'camper' : 'campers'}`]
                  .filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="mt-6 space-y-6">
              {cohort.participants.map((p) => (
                <Participant key={p.name} participant={p} onOpen={setLightbox} />
              ))}
            </div>
          </section>
        ))}

        <footer className="mt-16 border-t border-gray-200 pt-6 text-sm text-gray-500">
          <p>
            Camper names are shortened and anything a camper or family marked private is left out.
            Please treat this page as confidential and don't republish it.
          </p>
          <p className="mt-2">
            Generated {new Date(data.generated_at).toLocaleDateString()} · optioeducation.com
          </p>
        </footer>
      </main>

      {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

export default PoeShowcasePage
