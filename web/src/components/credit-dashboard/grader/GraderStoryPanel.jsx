import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { storiesApi, errorDetails } from '../../../services/storiesApi'
import StoryConsentPanel from '../../admin/stories/StoryConsentPanel'
import { STORY_STATUS_LABELS, STORY_STATUS_STYLES } from '../../admin/stories/storyEditorState'

/**
 * One click from a finalized credit item to a story on www.
 *
 * Shown to a superadmin under the decision column once credit is final. The
 * primary button drafts, safety-checks and publishes without an editing
 * step; "Draft for review instead" makes the same story but parks it for the
 * editor. Either way the server answers 202 and the work runs on a thread,
 * so the panel polls the story every few seconds until its status settles
 * and then shows the outcome in place: the www link and the AI's concerns,
 * the blockers that sent it to review, or the error and a retry.
 *
 * The parent keys this on the completion id, so walking to the next item
 * gets a fresh panel rather than a stale poll.
 *
 * `onOpenStory` is optional on purpose. The page passes a handler; without
 * one the panel renders a plain link, so a test of the grader needs no router.
 */
const GraderStoryPanel = ({
  completionId, onOpenStory, pollIntervalMs = 3000, maxPolls = 100,
}) => {
  const [elig, setElig] = useState({ loading: true, data: null, error: null })
  const [storyId, setStoryId] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(null)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!completionId) return undefined
    let cancelled = false
    storiesApi.eligibility(completionId)
      .then(async (data) => {
        if (cancelled) return
        setElig({ loading: false, data: data || {}, error: null })
        const existing = data?.existing_story
        if (existing?.id) {
          setStoryId(existing.id)
          setResult({ story: existing })
          const full = await storiesApi.get(existing.id).catch(() => null)
          if (!cancelled && full?.story) setResult(full)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setElig({
          loading: false, data: null,
          error: err.response?.data?.error || 'Could not check whether this can become a story.',
        })
      })
    return () => { cancelled = true }
  }, [completionId])

  const status = result?.story?.status
  useEffect(() => {
    if (!storyId || status !== 'generating') return undefined
    let cancelled = false
    let polls = 0
    const timer = setInterval(async () => {
      polls += 1
      if (polls > maxPolls) {
        clearInterval(timer)
        if (!cancelled) setTimedOut(true)
        return
      }
      try {
        const res = await storiesApi.get(storyId)
        if (cancelled || !res?.story) return
        setResult(res)
      } catch {
        // A blip is not a reason to stop watching; the attempt cap is.
      }
    }, pollIntervalMs)
    return () => { cancelled = true; clearInterval(timer) }
  }, [storyId, status, pollIntervalMs, maxPolls])

  const start = async ({ sourceType, sourceId, mode }) => {
    setBusy(`${mode}:${sourceType}`)
    setTimedOut(false)
    try {
      const res = await storiesApi.start({ sourceType, sourceId, mode })
      setResult({ story: res?.story, blockers: [], concerns: [] })
      setStoryId(res?.story?.id || null)
    } catch (err) {
      const existingId = errorDetails(err).existing_story_id
      if (err.response?.status === 409 && existingId) {
        const full = await storiesApi.get(existingId).catch(() => null)
        if (full?.story) {
          setResult(full)
          setStoryId(existingId)
        } else {
          toast.error('A story for this already exists.')
        }
      } else {
        toast.error(err.response?.data?.error || 'Could not start the story.')
      }
    } finally {
      setBusy(null)
    }
  }

  const retry = async () => {
    if (!storyId) return
    setBusy('retry')
    setTimedOut(false)
    try {
      const res = await storiesApi.regenerate(storyId)
      setResult(prev => ({ ...(prev || {}), story: res?.story || prev?.story, blockers: [], concerns: [] }))
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not restart the story.')
    } finally {
      setBusy(null)
    }
  }

  const data = elig.data || {}
  const quest = data.quest || null

  return (
    <section
      aria-labelledby="grader-story-title"
      className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"
      data-testid="grader-story-panel"
    >
      <div className="flex items-center gap-3">
        <h3 id="grader-story-title" className="text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
          Story for www
        </h3>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {elig.loading && (
        <p aria-live="polite" className="text-sm text-gray-500">Checking…</p>
      )}

      {elig.error && (
        <p className="text-sm text-red-700">{elig.error}</p>
      )}

      {!elig.loading && !elig.error && (
        <>
          <StoryConsentPanel
            studentUserId={data.student_user_id}
            consent={data.consent}
            onChange={(consent) => setElig(e => ({ ...e, data: { ...(e.data || {}), consent } }))}
          />

          {result?.story ? (
            <StoryOutcome
              result={result}
              timedOut={timedOut}
              busy={busy}
              onRetry={retry}
              onOpenStory={onOpenStory}
            />
          ) : (
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => start({ sourceType: 'credit_submission', sourceId: completionId, mode: 'auto' })}
                  disabled={!!busy}
                  aria-busy={busy === 'auto:credit_submission'}
                  className="btn-primary flex-1 min-h-[44px]"
                >
                  {busy === 'auto:credit_submission' ? 'Starting…' : 'Publish story'}
                </button>
                <button
                  type="button"
                  onClick={() => start({ sourceType: 'quest', sourceId: quest?.user_quest_id, mode: 'auto' })}
                  disabled={!!busy || !quest?.complete || !quest?.user_quest_id}
                  aria-busy={busy === 'auto:quest'}
                  title={quest && !quest.complete
                    ? `The quest is not complete yet (${quest.finalized_count ?? 0} of ${quest.task_count ?? 0} tasks finalized)`
                    : undefined}
                  className="btn-quiet flex-1 min-h-[44px]"
                >
                  {busy === 'auto:quest' ? 'Starting…' : 'Publish whole quest'}
                  {quest?.task_count != null && (
                    <span className="text-gray-400 font-normal">
                      ({quest.task_count} {quest.task_count === 1 ? 'task' : 'tasks'})
                    </span>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => start({ sourceType: 'credit_submission', sourceId: completionId, mode: 'review' })}
                disabled={!!busy}
                className="text-xs font-medium text-optio-purple hover:text-optio-purple-dark disabled:opacity-50 disabled:cursor-not-allowed min-h-[32px] md:min-h-0 touch-manipulation"
              >
                Draft for review instead
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}


const OpenStoryLink = ({ storyId, onOpenStory, label = 'Open story', className = '' }) => {
  const classes = `text-sm font-medium text-optio-purple hover:text-optio-purple-dark min-h-[32px] md:min-h-0 touch-manipulation ${className}`
  if (onOpenStory) {
    return (
      <button type="button" onClick={() => onOpenStory(storyId)} className={classes}>
        {label}
      </button>
    )
  }
  return <a href={`/admin/stories/${storyId}`} className={classes}>{label}</a>
}


/**
 * The story after the click, in whichever state the server left it.
 */
const StoryOutcome = ({ result, timedOut, busy, onRetry, onOpenStory }) => {
  const story = result.story
  const status = story?.status
  const label = STORY_STATUS_LABELS[status] || status
  const pill = STORY_STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'
  const blockers = result.blockers || story?.blockers || []
  const concerns = result.concerns || story?.concerns || []

  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex rounded-full text-xs font-medium px-2 py-0.5 ${pill}`}>
          {label}
        </span>
        {story?.title && <span className="text-sm text-gray-700 truncate">{story.title}</span>}
      </div>

      {status === 'generating' && (
        <p className="text-sm text-gray-600">
          {timedOut
            ? 'Still generating after five minutes. Open the story to check on it.'
            : 'Drafting, checking the images, and publishing. This takes a minute or two.'}
        </p>
      )}

      {status === 'published' && (
        <>
          {result.marketing_url && (
            <a
              href={result.marketing_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-optio-purple hover:text-optio-purple-dark break-all"
            >
              View on www
            </a>
          )}
          {concerns.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
              <p className="text-xs font-medium text-amber-900 mb-0.5">Worth a look</p>
              <ul className="space-y-0.5">
                {concerns.map((c, i) => (
                  <li key={i} className="text-xs text-amber-900">{c}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {status === 'review' && blockers.length > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-2.5">
          <p className="text-xs font-medium text-yellow-900 mb-0.5">Why it did not publish</p>
          <ul className="space-y-0.5">
            {blockers.map((b, i) => (
              <li key={b.code || i} className="text-xs text-yellow-900">{b.message || b.code}</li>
            ))}
          </ul>
        </div>
      )}

      {status === 'failed' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-2.5">
          <p className="text-xs text-red-800">{story?.error || 'The story did not finish.'}</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={busy === 'retry'}
            className="mt-2 btn-quiet text-optio-purple"
          >
            {busy === 'retry' ? 'Starting…' : 'Retry'}
          </button>
        </div>
      )}

      {story?.id && status !== 'generating' && (
        <OpenStoryLink
          storyId={story.id}
          onOpenStory={onOpenStory}
          label={status === 'review' ? 'Open in editor' : 'Open story'}
        />
      )}
      {story?.id && status === 'generating' && timedOut && (
        <OpenStoryLink storyId={story.id} onOpenStory={onOpenStory} />
      )}
    </div>
  )
}

export default GraderStoryPanel
