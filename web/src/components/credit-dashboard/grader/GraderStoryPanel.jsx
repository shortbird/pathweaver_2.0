import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { storiesApi } from '../../../services/storiesApi'
import { STORY_STATUS_LABELS, STORY_STATUS_STYLES } from '../../admin/stories/storyEditorState'

/**
 * One bookmark from a credit item to the Stories page.
 *
 * Shown to a superadmin under the decision column at any stage of review.
 * The one thing it does is flag the item for a story later: the same
 * bookmark the app's feed sets (routes/stories/candidates.py), which lands
 * the item in the queue on /admin/stories with everything the editor needs
 * to draft, check and publish from there. Until 2026-09-15 this panel also
 * drafted, published and published the whole quest, and a reviewer moving
 * through a grading batch is not in a position to make any of those calls;
 * the queue is where they get made.
 *
 * A story that already exists for the item shows its status and a link
 * instead of the bookmark, because bookmarking it again is a no-op the
 * server would refuse anyway.
 *
 * The parent keys this on the completion id, so walking to the next item
 * gets a fresh panel rather than a stale fetch.
 *
 * `onOpenStory` is optional on purpose. The page passes a handler; without
 * one the panel renders a plain link, so a test of the grader needs no router.
 */
const GraderStoryPanel = ({ completionId, onOpenStory }) => {
  const [elig, setElig] = useState({ loading: true, data: null, error: null })
  const [flagged, setFlagged] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!completionId) return undefined
    let cancelled = false
    storiesApi.eligibility(completionId)
      .then((data) => {
        if (cancelled) return
        setElig({ loading: false, data: data || {}, error: null })
        setFlagged(!!data?.is_story_candidate)
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

  const toggle = async (on) => {
    setBusy(true)
    try {
      const res = await storiesApi.toggleCandidate({ targetId: completionId, on })
      setFlagged(!!res?.is_story_candidate)
    } catch (err) {
      toast.error(err.response?.data?.error || (on
        ? 'Could not add this to story review.'
        : 'Could not take this out of story review.'))
    } finally {
      setBusy(false)
    }
  }

  const existing = elig.data?.existing_story

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
        existing?.id ? (
          <ExistingStory story={existing} onOpenStory={onOpenStory} />
        ) : flagged ? (
          <div className="flex items-center justify-between gap-3 flex-wrap" aria-live="polite">
            <p className="text-sm text-gray-700" data-testid="story-flagged">
              In your story review queue.{' '}
              <a
                href="/admin/stories"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-optio-purple hover:text-optio-purple-dark"
              >
                Open Stories
              </a>
            </p>
            <button
              type="button"
              onClick={() => toggle(false)}
              disabled={busy}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50 min-h-[32px] md:min-h-0 touch-manipulation"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => toggle(true)}
            disabled={busy}
            aria-busy={busy}
            className="btn-quiet w-full min-h-[44px] text-optio-purple"
          >
            {busy ? 'Adding…' : 'Add to story review'}
          </button>
        )
      )}
    </section>
  )
}


const OpenStoryLink = ({ storyId, onOpenStory, label = 'Open story' }) => {
  const classes = 'text-sm font-medium text-optio-purple hover:text-optio-purple-dark min-h-[32px] md:min-h-0 touch-manipulation'
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
 * A story that already exists for this item, in whichever state it is in.
 */
const ExistingStory = ({ story, onOpenStory }) => {
  const status = story?.status
  const label = STORY_STATUS_LABELS[status] || status
  const pill = STORY_STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex rounded-full text-xs font-medium px-2 py-0.5 ${pill}`}>
          {label}
        </span>
        {story?.title && <span className="text-sm text-gray-700 truncate">{story.title}</span>}
      </div>
      <OpenStoryLink
        storyId={story.id}
        onOpenStory={onOpenStory}
        label={status === 'review' ? 'Open in editor' : 'Open story'}
      />
    </div>
  )
}

export default GraderStoryPanel
