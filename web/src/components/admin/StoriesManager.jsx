import React, { useEffect, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { storiesApi, errorDetails } from '../../services/storiesApi'
import { Spinner } from '../ui/Spinner'
import {
  STORY_STATUSES, STORY_STATUS_LABELS, STORY_STATUS_STYLES,
} from './stories/storyEditorState'

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

/**
 * Every story on www, and the ones that never got there.
 *
 * Most stories start from the grader, so this list is mainly for finding a
 * story after the fact: the one the email flagged, the one a parent asked
 * about, the one that landed in review. The "New story" form is the escape
 * hatch for a quest that has no finalized item open in the grader right now;
 * it takes a user_quest id because Phase 1 has no per-student quest browser,
 * and always drafts for review so nothing typed by hand publishes unread.
 */
const StoriesManager = () => {
  const navigate = useNavigate()
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ source_type: 'quest', source_id: '' })
  const [creating, setCreating] = useState(false)

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
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Stories</h2>
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
                  <th className="px-3 py-2.5 font-medium">Student</th>
                  <th className="px-3 py-2.5 font-medium">Subject</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 font-medium">Tier</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stories.map(story => (
                  <tr
                    key={story.id}
                    onClick={() => navigate(`/admin/stories/${story.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-3">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); navigate(`/admin/stories/${story.id}`) }}
                        className="font-medium text-gray-900 hover:text-optio-purple text-left"
                      >
                        {story.title || 'Untitled'}
                      </button>
                      {story.slug && <div className="text-xs text-gray-400 font-mono">{story.slug}</div>}
                    </td>
                    <td className="px-3 py-3 text-gray-700">{story.student_label}</td>
                    <td className="px-3 py-3 text-gray-700">{story.subject}</td>
                    <td className="px-3 py-3 text-gray-700">{SOURCE_LABELS[story.source_type] || story.source_type}</td>
                    <td className="px-3 py-3 text-gray-700">
                      {story.tier}
                      {story.mode === 'review' && <span className="text-gray-400"> · review</span>}
                    </td>
                    <td className="px-3 py-3"><StoryStatusPill status={story.status} /></td>
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
