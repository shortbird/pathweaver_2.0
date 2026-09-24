import React, { useEffect, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { storiesApi, errorDetails } from '../../services/storiesApi'
import { Spinner } from '../ui/Spinner'
import {
  STORY_STATUSES, STORY_STATUS_LABELS, STORY_STATUS_STYLES, SETTING_OPTIONS,
} from './stories/storyEditorState'
import StoryCandidatesQueue from './stories/StoryCandidatesQueue'

/** One pill per story status, shared by the list and the editor header. */
export const StoryStatusPill = ({ status, className = '' }) => {
  if (!status) return null
  return (
    <span
      className={`inline-flex rounded-full text-xs font-medium px-2 py-0.5 whitespace-nowrap ${
        STORY_STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'
      } ${className}`}
    >
      {STORY_STATUS_LABELS[status] || status}
    </span>
  )
}

const SOURCE_LABELS = {
  credit_submission: 'Task',
  quest: 'Quest',
  learning_moment: 'Learning moment',
  manual: 'Manual',
}

const when = (iso) => (iso ? new Date(iso).toLocaleDateString() : '')

const FEATURED_SLOTS = [1, 2, 3]

/**
 * The lineup after putting `storyId` in `slot` (or taking it out, slot 0).
 * Whoever held the slot gives it up. Gaps close up, because the home page
 * reads the ranks in order and fills what is left with the newest stories.
 */
export const nextLineup = (stories, storyId, slot) => {
  const lineup = FEATURED_SLOTS.map(n => stories.find(s => s.featured_rank === n)?.id || null)
    .map(id => (id === storyId ? null : id))
  if (slot) lineup[slot - 1] = storyId
  return lineup.filter(Boolean)
}

/**
 * The three www shows, as marketing/src/lib/stories.ts `homeLineup` picks
 * them: the featured stories in slot order, then the newest published ones
 * in any slot nobody picked. Each carries `picked` so the panel can say which.
 */
export const homeLineup = (stories, count = 3) => {
  const published = stories.filter(s => s.status === 'published')
  const picked = published.filter(s => s.featured_rank)
    .sort((a, b) => a.featured_rank - b.featured_rank)
    .map(s => ({ story: s, picked: true }))
  const newest = published.filter(s => !s.featured_rank)
    .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
    .map(s => ({ story: s, picked: false }))
  return [...picked, ...newest].slice(0, count)
}

/** Featured stories first, in slot order; the rest keep the API's order. */
export const featuredFirst = (stories) => [
  ...stories.filter(s => s.featured_rank).sort((a, b) => a.featured_rank - b.featured_rank),
  ...stories.filter(s => !s.featured_rank),
]

/** What leads the story's card on www: the hero still, else the student's words. */
const SampleThumb = ({ sample, className = 'w-16 h-16' }) => {
  if (sample?.image_url) {
    return (
      <img
        src={sample.image_url}
        alt={sample.image_alt || ''}
        loading="lazy"
        className={`${className} shrink-0 rounded-lg object-cover bg-gray-100`}
      />
    )
  }
  if (sample?.quote) {
    return (
      <div className={`${className} shrink-0 rounded-lg bg-optio-purple/10 text-optio-purple text-[10px] leading-tight p-1.5 overflow-hidden`}>
        &ldquo;{sample.quote}&rdquo;
      </div>
    )
  }
  return <div className={`${className} shrink-0 rounded-lg bg-gray-100`} aria-hidden="true" />
}

/** The home page strip as it will look after the next rebuild. */
const HomeLineupPreview = ({ stories, onOpen }) => {
  const lineup = homeLineup(stories)
  if (lineup.length === 0) return null
  return (
    <div className="px-6 py-4 border-b bg-gray-50">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">On the home page</h3>
      {lineup.length < 3 && (
        <p className="text-xs text-gray-500 mb-3">
          The home page needs three published stories. Until then it shows the stock examples.
        </p>
      )}
      <div className="grid md:grid-cols-3 gap-4">
        {lineup.map(({ story, picked }, i) => (
          <button
            key={story.id}
            type="button"
            onClick={() => onOpen(story.id)}
            className="text-left bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-optio-purple"
          >
            {story.sample?.image_url ? (
              <img src={story.sample.image_url} alt={story.sample.image_alt || ''} loading="lazy"
                   className="w-full h-36 object-cover bg-gray-100" />
            ) : story.sample?.quote ? (
              <div className="h-36 p-4 bg-optio-purple/10 text-optio-purple text-sm overflow-hidden">
                &ldquo;{story.sample.quote}&rdquo;
              </div>
            ) : (
              <div className="h-36 bg-gray-100" aria-hidden="true" />
            )}
            <div className="p-3 space-y-1">
              <div className="text-xs font-medium text-gray-500">
                Slot {i + 1} · {picked ? 'Picked' : 'Newest, not picked'}
              </div>
              <div className="font-medium text-gray-900 line-clamp-2">{story.title || 'Untitled'}</div>
              {story.sample?.dek && <p className="text-xs text-gray-600 line-clamp-3">{story.sample.dek}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Every story on www, and the ones that never got there.
 *
 * Most stories start from the grader, so this list is mainly for finding a
 * story after the fact: the one the email flagged, the one a parent asked
 * about, the one that landed in review. The "New story" form is the escape
 * hatch for a quest that has no finalized item open in the grader right now;
 * it takes a user_quest id because Phase 1 has no per-student quest browser,
 * and always drafts for review so nothing typed by hand publishes unread.
 *
 * Above the list: the queue of feed items bookmarked in the mobile app
 * (StoryCandidatesQueue), each with the same draft-for-review button.
 */
const StoriesManager = () => {
  const navigate = useNavigate()
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ source_type: 'quest', source_id: '' })
  const [creating, setCreating] = useState(false)
  const [savingFeatured, setSavingFeatured] = useState(false)

  const setFeatured = async (storyId, slot) => {
    const ids = nextLineup(stories, storyId, slot)
    setSavingFeatured(true)
    try {
      await storiesApi.setFeatured(ids)
      setStories(prev => prev.map(s => {
        const i = ids.indexOf(s.id)
        return { ...s, featured_rank: i === -1 ? null : i + 1 }
      }))
      toast.success('Home page updated. www rebuilds in a few minutes.')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update the home page')
    } finally {
      setSavingFeatured(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    storiesApi.list(statusFilter || undefined)
      .then((res) => { if (!cancelled) setStories(res?.stories || []) })
      .catch(() => { if (!cancelled) toast.error('Could not load stories') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [statusFilter])

  const createDraft = async (e) => {
    e.preventDefault()
    const sourceId = newForm.source_id.trim()
    if (!sourceId) { toast.error('Paste the id first'); return }
    setCreating(true)
    try {
      const res = await storiesApi.start({
        sourceType: newForm.source_type, sourceId, mode: 'review',
      })
      if (res?.story?.id) navigate(`/admin/stories/${res.story.id}`)
    } catch (err) {
      const existingId = errorDetails(err).existing_story_id
      if (err.response?.status === 409 && existingId) {
        toast('A story for this already exists. Opening it.')
        navigate(`/admin/stories/${existingId}`)
      } else {
        toast.error(err.response?.data?.error || 'Could not start the story')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <StoryCandidatesQueue />

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900">Stories</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Pick up to three for the www home page. Empty slots show the newest stories.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="sr-only" htmlFor="stories-status-filter">Filter by status</label>
            <select
              id="stories-status-filter"
              value={statusFilter}
              onChange={e => { setLoading(true); setStatusFilter(e.target.value) }}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
            >
              <option value="">All statuses</option>
              {STORY_STATUSES.map(s => (
                <option key={s} value={s}>{STORY_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNew(o => !o)}
              className="btn-primary whitespace-nowrap"
            >
              New story from a student quest
            </button>
          </div>
        </div>

        {!loading && (
          <HomeLineupPreview stories={stories} onOpen={id => navigate(`/admin/stories/${id}`)} />
        )}

        {showNew && (
          <form onSubmit={createDraft} className="px-6 py-4 border-b bg-gray-50 space-y-3" aria-label="New story">
            <p className="text-sm text-gray-600">
              Paste the student&apos;s <code className="text-xs bg-gray-100 px-1 rounded">user_quests.id</code> (or a
              <code className="text-xs bg-gray-100 px-1 rounded ml-1">quest_task_completions.id</code>).
              The story drafts for review; nothing publishes until you read it.
              Finalized items in the credit grader have a one-click button that does the same.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={newForm.source_type}
                onChange={e => setNewForm(f => ({ ...f, source_type: e.target.value }))}
                aria-label="Source type"
                className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
              >
                <option value="quest">Whole quest (user_quest id)</option>
                <option value="credit_submission">One task (completion id)</option>
              </select>
              <input
                type="text"
                value={newForm.source_id}
                onChange={e => setNewForm(f => ({ ...f, source_id: e.target.value }))}
                placeholder="Paste the id"
                aria-label="Source id"
                className="flex-1 text-sm font-mono border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
              />
              <button type="submit" disabled={creating} className="btn-primary whitespace-nowrap">
                {creating ? 'Starting…' : 'Draft for review'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-12"><Spinner size="lg" /></div>
        ) : stories.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            {statusFilter ? 'No stories with that status.' : 'No stories yet. Publish one from a finalized item in the credit grader.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-6 py-2.5 font-medium">Title</th>
                  <th className="px-3 py-2.5 font-medium">School</th>
                  <th className="px-3 py-2.5 font-medium">Subject</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 font-medium">Tier</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Home page</th>
                  <th className="px-3 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {featuredFirst(stories).map(story => (
                  <tr
                    key={story.id}
                    onClick={() => navigate(`/admin/stories/${story.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-3">
                      <div className="flex gap-3 items-start max-w-xl">
                        <SampleThumb sample={story.sample} />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(`/admin/stories/${story.id}`) }}
                            className="font-medium text-gray-900 hover:text-optio-purple text-left"
                          >
                            {story.title || 'Untitled'}
                          </button>
                          {story.sample?.dek && (
                            <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{story.sample.dek}</p>
                          )}
                          {story.sample?.course && (
                            <div className="text-xs text-gray-400 mt-0.5">
                              {story.sample.course}
                              {story.sample.credit && ` · ${story.sample.credit}`}
                              {story.sample.evidence_count > 0 && ` · ${story.sample.evidence_count} ${story.sample.evidence_count === 1 ? 'piece' : 'pieces'} of evidence`}
                            </div>
                          )}
                          {!story.sample && story.slug && (
                            <div className="text-xs text-gray-400 font-mono">{story.slug}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                      {SETTING_OPTIONS.find(o => o.value === story.setting)?.label || story.setting || ''}
                      {story.tier === 'named' && story.student_label && (
                        <span className="text-gray-400"> · {story.student_label}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-700">{story.subject}</td>
                    <td className="px-3 py-3 text-gray-700">{SOURCE_LABELS[story.source_type] || story.source_type}</td>
                    <td className="px-3 py-3 text-gray-700">
                      {story.tier}
                      {story.mode === 'review' && <span className="text-gray-400"> · review</span>}
                    </td>
                    <td className="px-3 py-3"><StoryStatusPill status={story.status} /></td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      {story.status === 'published' && (
                        <select
                          value={story.featured_rank || 0}
                          disabled={savingFeatured}
                          onChange={e => setFeatured(story.id, Number(e.target.value))}
                          aria-label={`Home page slot for ${story.title || 'this story'}`}
                          className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
                        >
                          <option value={0}>Not featured</option>
                          {FEATURED_SLOTS.map(n => <option key={n} value={n}>Slot {n}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                      {when(story.published_at || story.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(StoriesManager)
