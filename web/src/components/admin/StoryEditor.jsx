import React, { useCallback, useEffect, useState, memo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { storiesApi, errorDetails } from '../../services/storiesApi'
import MarkdownEditor from '../curriculum/MarkdownEditor'
import { PageLoader } from '../ui/Spinner'
import { useConfirm } from '../../contexts/ConfirmContext'
import { StoryStatusPill } from './StoriesManager'
import StoryConsentPanel from './stories/StoryConsentPanel'
import StoryEvidencePicker from './stories/StoryEvidencePicker'
import StoryCriteriaRounds from './stories/StoryCriteriaRounds'
import StoryFaqEditor from './stories/StoryFaqEditor'
import StoryPreview from './stories/StoryPreview'
import {
  ACTIVITY_SLUGS, RECEIPT_ICONS, SETTING_OPTIONS, GRADE_BAND_OPTIONS,
  TITLE_TARGET_CHARS, DEK_TARGET_CHARS,
  applyTitleOption, publishBlockers, sectionByKind, updateSection,
} from './stories/storyEditorState'

const MARKETING_URL = import.meta.env.VITE_MARKETING_URL || 'https://www.optioeducation.com'

const POLL_MS = 3000
const MAX_POLLS = 100

const inputClass = 'w-full text-sm rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple'
const labelClass = 'block text-xs font-medium text-gray-700 mb-1'

const Field = ({ id, label, aside, children }) => (
  <div>
    <div className="flex items-center justify-between">
      <label htmlFor={id} className={labelClass}>{label}</label>
      {aside}
    </div>
    {children}
  </div>
)

/** A labelled block whose control is a component, not one input. */
const Group = ({ label, children }) => (
  <div>
    <p className={labelClass}>{label}</p>
    {children}
  </div>
)

/**
 * A select that keeps whatever value the server sent, even one this list
 * does not know. The lists here are the editor's guess at the vocabulary;
 * the backend owns it, and an unknown value must survive a round trip
 * rather than be silently swapped for the first option.
 */
const Select = ({ id, value, options, onChange, allowEmpty = true }) => {
  const known = options.some(o => (o.value ?? o) === value)
  return (
    <select id={id} value={value || ''} onChange={e => onChange(e.target.value)} className={inputClass}>
      {allowEmpty && <option value="">--</option>}
      {!known && value && <option value={value}>{value}</option>}
      {options.map(o => {
        const v = o.value ?? o
        return <option key={v} value={v}>{o.label ?? v}</option>
      })}
    </select>
  )
}

const SectionHeading = ({ children, hint }) => (
  <div className="flex items-center gap-3 pt-2">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">{children}</h3>
    {hint && <span className="text-xs text-gray-400 truncate">{hint}</span>}
    <div className="h-px flex-1 bg-gray-200" />
  </div>
)

/** A folded card for the parts an editor rarely touches. */
const Folded = ({ title, hint, children }) => (
  <details className="rounded-lg border border-gray-200 bg-white group">
    <summary className="cursor-pointer select-none px-4 py-3 flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</span>
      {hint && <span className="text-xs text-gray-400 truncate">{hint}</span>}
    </summary>
    <div className="px-4 pb-4 pt-1 space-y-4">{children}</div>
  </details>
)

/**
 * How long a title or a dek is against what a search result shows. Over the
 * target is a nudge, not a blocker: the backend caps the hard limits.
 */
const CharCount = ({ value, target }) => {
  const n = (value || '').length
  const over = n > target
  return (
    <span className={`text-xs tabular-nums ${over ? 'text-amber-700' : 'text-gray-400'}`} aria-live="polite">
      {n}/{target}
    </span>
  )
}

const editableBody = (story, assets) => ({
  title: story.title,
  slug: story.slug,
  dek: story.dek,
  setting: story.setting,
  grade_band: story.grade_band,
  activity_slug: story.activity_slug,
  activity_label: story.activity_label,
  receipt: story.receipt,
  body: story.body,
  faq: story.faq,
  hero_asset_id: story.hero_asset_id,
  assets: assets.map(a => ({
    id: a.id, included: !!a.included, alt: a.alt || '', caption: a.caption || '',
  })),
})

/**
 * The editor for one story: fixes after the fact, and the review step for
 * a story that did not publish itself.
 *
 * Left is the form, right is the page as it will render. The form is in the
 * order that matters for a page whose job is to rank: what a search result
 * shows (title, URL, dek, the FAQ that becomes structured data), then the
 * evidence the page leads with, then the words, then the facts, then the
 * parts an editor rarely touches, folded. The form never saves on its own;
 * Save is a PUT of the editable subset, and Publish saves first so the
 * server checks what is on screen, not what was there a minute ago.
 * Blockers come from two places and both are shown: the ones this file can
 * see (`publishBlockers`) as the story is typed, and the server's list from
 * the last publish attempt or the load.
 */
const StoryEditor = () => {
  const { storyId } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const [loading, setLoading] = useState(true)
  const [story, setStory] = useState(null)
  const [assets, setAssets] = useState([])
  const [consent, setConsent] = useState(null)
  const [serverBlockers, setServerBlockers] = useState([])
  const [concerns, setConcerns] = useState([])
  const [marketingUrl, setMarketingUrl] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const applyLoaded = useCallback((res) => {
    setStory(res.story)
    setAssets(res.assets || [])
    setConsent(res.consent || null)
    setServerBlockers(res.blockers || res.story?.blockers || [])
    setConcerns(res.concerns || res.story?.concerns || [])
    setMarketingUrl(res.marketing_url || null)
    setDirty(false)
  }, [])

  useEffect(() => {
    if (!storyId) return undefined
    let cancelled = false
    storiesApi.get(storyId)
      .then((res) => { if (!cancelled && res?.story) applyLoaded(res) })
      .catch((err) => { if (!cancelled) toast.error(err.response?.data?.error || 'Could not load the story') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [storyId, reloadKey])

  // While the server is drafting, the page underneath changes on its own.
  const status = story?.status
  useEffect(() => {
    if (!storyId || status !== 'generating') return undefined
    let cancelled = false
    let polls = 0
    const timer = setInterval(async () => {
      polls += 1
      if (polls > MAX_POLLS) { clearInterval(timer); return }
      try {
        const res = await storiesApi.get(storyId)
        if (cancelled || !res?.story) return
        if (res.story.status !== 'generating') applyLoaded(res)
      } catch {
        // A blip is not a reason to stop watching; the attempt cap is.
      }
    }, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [storyId, status])

  const patch = (changes) => {
    setStory(s => ({ ...s, ...changes }))
    setDirty(true)
  }
  const patchSection = (kind, changes) => {
    setStory(s => updateSection(s, kind, changes))
    setDirty(true)
  }
  const patchAssets = (next) => {
    setAssets(next)
    setDirty(true)
  }

  const save = async () => {
    if (!story) return null
    setBusy('save')
    try {
      const res = await storiesApi.update(story.id, editableBody(story, assets))
      if (res?.story) {
        setStory(res.story)
        setServerBlockers(res.blockers || res.story.blockers || serverBlockers)
      }
      setDirty(false)
      toast.success('Saved')
      return res
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the story')
      return null
    } finally {
      setBusy(null)
    }
  }

  const publish = async () => {
    if (!story) return
    if (dirty) {
      const saved = await save()
      if (!saved) return
    }
    setBusy('publish')
    try {
      const res = await storiesApi.publish(story.id)
      if (res?.story) setStory(res.story)
      setServerBlockers([])
      setReloadKey(k => k + 1)
      toast.success('Published')
    } catch (err) {
      const blockers = errorDetails(err).blockers
      if (err.response?.status === 400 && Array.isArray(blockers)) {
        setServerBlockers(blockers)
        toast.error('The story cannot publish yet')
      } else {
        toast.error(err.response?.data?.error || 'Could not publish the story')
      }
    } finally {
      setBusy(null)
    }
  }

  const unpublish = async () => {
    if (!story) return
    const ok = await confirm({
      title: 'Unpublish this story?',
      body: 'The page comes down on the next site build and its images are deleted from the public bucket.',
      confirmLabel: 'Unpublish',
    })
    if (!ok) return
    setBusy('unpublish')
    try {
      const res = await storiesApi.unpublish(story.id)
      if (res?.story) setStory(res.story)
      toast.success('Unpublished')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not unpublish the story')
    } finally {
      setBusy(null)
    }
  }

  const regenerate = async () => {
    if (!story) return
    const ok = await confirm({
      title: 'Regenerate this story?',
      body: 'The AI drafts it again from the source. Edits you made here are replaced.',
      confirmLabel: 'Regenerate',
    })
    if (!ok) return
    setBusy('regenerate')
    try {
      const res = await storiesApi.regenerate(story.id)
      if (res?.story) setStory(res.story)
      setDirty(false)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not regenerate the story')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <PageLoader label="Loading story" />
  if (!story) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">This story could not be loaded.</p>
        <button type="button" onClick={() => navigate('/admin/stories')} className="btn-quiet">Back to stories</button>
      </div>
    )
  }

  const generating = status === 'generating'
  const titleOptions = story.ai_draft?.data?.title_options || []
  const searchPhrases = story.body?.search_phrases || story.ai_draft?.data?.search_phrases || []
  const localBlockers = publishBlockers(story, assets)
  const serverCodes = new Set(serverBlockers.map(b => b.code))
  const blockers = [...serverBlockers, ...localBlockers.filter(b => !serverCodes.has(b.code))]
  const whatTheyDid = sectionByKind(story, 'what_they_did')?.body_md || ''
  const whatItCountedFor = sectionByKind(story, 'what_it_counted_for')?.body_md || ''
  const receipt = story.receipt || {}

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate('/admin/stories')}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Back to stories
          </button>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <h2 className="text-xl font-semibold text-gray-900 truncate">{story.title || 'Untitled story'}</h2>
            <StoryStatusPill status={status} />
            {story.tier && <span className="text-xs text-gray-500">{story.tier} tier</span>}
            {dirty && <span className="text-xs text-amber-700">Unsaved changes</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {marketingUrl && status === 'published' && (
            <a href={marketingUrl} target="_blank" rel="noopener noreferrer" className="btn-quiet">
              View on www
            </a>
          )}
          <button type="button" onClick={regenerate} disabled={!!busy || generating} className="btn-quiet">
            {busy === 'regenerate' ? 'Starting…' : 'Regenerate'}
          </button>
          {status === 'published' ? (
            <button type="button" onClick={unpublish} disabled={!!busy} className="btn-quiet text-red-700 hover:text-red-800 hover:border-red-300">
              {busy === 'unpublish' ? 'Working…' : 'Unpublish'}
            </button>
          ) : (
            <button type="button" onClick={publish} disabled={!!busy || generating} className="btn-primary">
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
          )}
          <button type="button" onClick={save} disabled={!!busy || generating || !dirty} className="btn-secondary">
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {generating && (
        <p aria-live="polite" className="text-sm text-gray-600 rounded-lg border border-optio-purple/20 bg-optio-purple/5 px-3 py-2">
          The AI is drafting this story. The page refreshes itself when it finishes.
        </p>
      )}

      {status === 'failed' && story.error && (
        <p className="text-sm text-red-800 rounded-lg border border-red-200 bg-red-50 px-3 py-2">{story.error}</p>
      )}

      {blockers.length > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3" role="status" aria-label="Publish blockers">
          <p className="text-xs font-medium text-yellow-900 mb-1">Before this can publish</p>
          <ul className="space-y-0.5">
            {blockers.map((b, i) => (
              <li key={b.code || i} className="text-sm text-yellow-900">{b.message || b.code}</li>
            ))}
          </ul>
        </div>
      )}

      {concerns.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-medium text-amber-900 mb-1">Worth a look</p>
          <ul className="space-y-0.5">
            {concerns.map((c, i) => <li key={i} className="text-sm text-amber-900">{c}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <div className="space-y-4">
          <SectionHeading hint="What a search result shows">Search</SectionHeading>

          <Field id="story-title" label="Title" aside={<CharCount value={story.title} target={TITLE_TARGET_CHARS} />}>
            <input id="story-title" type="text" value={story.title || ''} onChange={e => patch({ title: e.target.value })} className={inputClass} />
            {titleOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {titleOptions.map((option, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setStory(s => applyTitleOption(s, option)); setDirty(true) }}
                    className={`text-xs font-medium px-2 py-1 rounded-full border min-h-[32px] md:min-h-0 touch-manipulation ${
                      option === story.title
                        ? 'border-optio-purple bg-optio-purple/10 text-optio-purple'
                        : 'border-optio-purple/30 text-optio-purple hover:bg-optio-purple/10'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field id="story-slug" label="Slug">
            <input id="story-slug" type="text" value={story.slug || ''} onChange={e => patch({ slug: e.target.value })} className={`${inputClass} font-mono`} />
            <p className="mt-1 text-xs text-gray-400 font-mono truncate">{MARKETING_URL}/stories/{story.slug || ''}/</p>
          </Field>

          <Field id="story-dek" label="Dek" aside={<span className="flex items-center gap-2 text-xs text-gray-400">meta description <CharCount value={story.dek} target={DEK_TARGET_CHARS} /></span>}>
            <textarea id="story-dek" rows={2} value={story.dek || ''} onChange={e => patch({ dek: e.target.value })} className={inputClass} />
          </Field>

          <Group label="FAQ (structured data)">
            <StoryFaqEditor faq={story.faq || []} onChange={faq => patch({ faq })} />
          </Group>

          {searchPhrases.length > 0 && (
            <div>
              <p className={labelClass}>What the draft was written to answer</p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Search phrases">
                {searchPhrases.map((phrase, i) => (
                  <li key={i} className="text-xs text-gray-600 bg-gray-100 rounded-full px-2 py-1">{phrase}</li>
                ))}
              </ul>
            </div>
          )}

          <SectionHeading hint="The page leads with the hero">Hero and evidence</SectionHeading>
          <StoryEvidencePicker
            assets={assets}
            tier={story.tier}
            heroAssetId={story.hero_asset_id}
            onChange={patchAssets}
            onHeroChange={id => patch({ hero_asset_id: id })}
            story={story}
            onStoryChange={next => { setStory(next); setDirty(true) }}
          />

          <SectionHeading>Story</SectionHeading>
          <Group label="What the student did">
            <MarkdownEditor
              value={whatTheyDid}
              onChange={val => patchSection('what_they_did', { body_md: val })}
              placeholder="What the student did, in plain words."
            />
          </Group>
          <Group label="What it counted for">
            <MarkdownEditor
              value={whatItCountedFor}
              onChange={val => patchSection('what_it_counted_for', { body_md: val })}
              placeholder="Two or three sentences: the subject, one assignment among many, why the evidence earned it."
            />
          </Group>

          <SectionHeading>Facts</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field id="story-setting" label="School">
              <Select id="story-setting" value={story.setting} options={SETTING_OPTIONS} onChange={v => patch({ setting: v })} />
            </Field>
            <Field id="story-grade-band" label="Grade band">
              <Select id="story-grade-band" value={story.grade_band} options={GRADE_BAND_OPTIONS} onChange={v => patch({ grade_band: v })} />
            </Field>
            <Field id="story-activity" label="Lander">
              <Select id="story-activity" value={story.activity_slug} options={ACTIVITY_SLUGS} onChange={v => patch({ activity_slug: v })} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field id="story-activity-label" label="Activity">
              <input id="story-activity-label" type="text" value={story.activity_label || ''} onChange={e => patch({ activity_label: e.target.value })} className={inputClass} />
            </Field>
            <Field id="receipt-activity" label="Receipt line">
              <input id="receipt-activity" type="text" value={receipt.activity || ''} onChange={e => patch({ receipt: { ...receipt, activity: e.target.value } })} className={inputClass} />
            </Field>
            <Field id="receipt-icon" label="Receipt icon">
              <Select id="receipt-icon" value={receipt.icon} options={RECEIPT_ICONS} onChange={v => patch({ receipt: { ...receipt, icon: v } })} />
            </Field>
          </div>
          <p className="text-xs text-gray-500">
            Receipt: {[receipt.course, receipt.credit].filter(Boolean).join(', ') || 'derived from the source'}.
            {story.tier === 'named' && story.student_label && ` Student: ${story.student_label}.`}
            {' '}The course, the credit and the label come from the source and cannot be edited here.
          </p>

          <Folded title="Review criteria" hint="Copied from the review; switch a row off to leave it out">
            <StoryCriteriaRounds story={story} onChange={next => { setStory(next); setDirty(true) }} />
          </Folded>

          <Folded title="Consent" hint={consent?.active ? 'On file' : 'None recorded'}>
            <StoryConsentPanel
              studentUserId={story.student_user_id}
              consent={consent}
              onChange={setConsent}
            />
          </Folded>
        </div>

        <div className="xl:sticky xl:top-4 rounded-xl border border-gray-200 bg-white p-6 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <StoryPreview story={story} assets={assets} />
        </div>
      </div>
    </div>
  )
}

export default memo(StoryEditor)
