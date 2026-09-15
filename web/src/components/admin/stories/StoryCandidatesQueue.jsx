import React from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { BookmarkIcon } from '@heroicons/react/24/outline'
import { errorDetails } from '../../../services/storiesApi'
import {
  useDismissStoryCandidate, useStartStoryFromCandidate, useStoryCandidates,
} from '../../../hooks/api/useStoryCandidates'

/**
 * Flagged from the app: feed items the superadmin bookmarked on a phone for
 * a story, waiting here on the Stories page (2026-09-15).
 *
 * The bookmark is a note to self. Most good work is seen first in the
 * mobile feed, where neither the grader's Publish button nor the paste-an-id
 * form below is at hand; one tap there, and the item sits here with what a
 * reviewer needs to decide: who, what, whether it is finalized, whether a
 * story already exists. A task can start a story two ways, the same two the
 * grader offers (this one submission, or the whole quest); a learning moment
 * cannot start one yet (stories Phase 2) and stays in the queue until it is
 * dismissed, so the bookmark is not lost. Every story started here drafts
 * for review, like the form below: nothing publishes unread.
 */

const REASONS = {
  confidential: 'marked confidential',
  missing: 'the submission is gone',
}

const when = (iso) => (iso ? new Date(iso).toLocaleDateString() : '')

function Reasons({ reasons }) {
  if (!reasons?.length) return null
  return <span className="text-xs text-gray-400">({reasons.map((r) => REASONS[r] || r).join(', ')})</span>
}

function CandidateRow({ candidate, onStart, onDismiss, onOpenStory, busy }) {
  const { item = {}, sources = {}, student = {} } = candidate
  const isTask = candidate.target_type === 'task_completed'
  const task = sources.credit_submission
  const quest = sources.quest
  const existing = task?.existing_story || quest?.existing_story

  return (
    <li className="px-6 py-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {student.display_name}
          <span className="text-gray-400 font-normal"> · {isTask ? 'task' : 'learning moment'}</span>
        </p>
        <p className="text-sm text-gray-700 truncate">
          {item.title || 'Untitled'}
          {isTask && item.quest_title && <span className="text-gray-400"> in {item.quest_title}</span>}
          {isTask && item.credited === false && (
            <span className="ml-2 text-xs text-amber-700">credit pending</span>
          )}
        </p>
        {!isTask && item.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{item.description}</p>
        )}
        {candidate.note && <p className="text-xs text-gray-600 mt-1 italic">&ldquo;{candidate.note}&rdquo;</p>}
        <p className="text-xs text-gray-400 mt-1">
          Flagged {when(candidate.created_at)}{candidate.flagged_by_name ? ` by ${candidate.flagged_by_name}` : ''}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
        {existing ? (
          <button type="button" onClick={() => onOpenStory(existing.id)} className="btn-primary px-3 py-1.5 text-sm">
            Open story
          </button>
        ) : isTask ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy || !task?.eligible}
                onClick={() => onStart(candidate, 'credit_submission', task.source_id)}
                className="btn-primary px-3 py-1.5 text-sm"
              >
                Draft from this task
              </button>
              <Reasons reasons={task?.reasons} />
            </span>
            {quest?.source_id && (
              <span className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy || !quest.can_start}
                  onClick={() => onStart(candidate, 'quest', quest.source_id)}
                  className="btn-quiet px-3 py-1.5 text-sm"
                >
                  Draft from the whole quest
                </button>
                <span className="text-xs text-gray-400">
                  ({quest.submitted_task_count}/{quest.task_count} submitted, {quest.credited_task_count} credited)
                </span>
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-gray-400">Learning moments are not a story source yet.</span>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onDismiss(candidate)}
          className="text-sm text-gray-400 hover:text-red-600"
          aria-label={`Dismiss ${item.title || 'this item'}`}
        >
          Dismiss
        </button>
      </div>
    </li>
  )
}

export default function StoryCandidatesQueue() {
  const navigate = useNavigate()
  const { data: candidates, isLoading } = useStoryCandidates('open')
  const start = useStartStoryFromCandidate()
  const dismiss = useDismissStoryCandidate()

  // Nothing flagged: the section stays out of the way.
  if (isLoading || !candidates?.length) return null

  const onStart = (candidate, sourceType, sourceId) => start.mutate(
    { candidateId: candidate.id, sourceType, sourceId },
    {
      onSuccess: (res) => { if (res?.story?.id) navigate(`/admin/stories/${res.story.id}`) },
      onError: (err) => {
        const existingId = errorDetails(err).existing_story_id
        if (err.response?.status === 409 && existingId) {
          toast('A story for this already exists. Opening it.')
          navigate(`/admin/stories/${existingId}`)
        } else {
          toast.error(err.response?.data?.error || 'Could not start the story')
        }
      },
    },
  )

  const onDismiss = (candidate) => dismiss.mutate(candidate.id, {
    onError: (err) => toast.error(err.response?.data?.error || 'Could not dismiss that'),
  })

  return (
    <section aria-label="Flagged from the app" className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center gap-2">
        <BookmarkIcon className="w-4 h-4 text-optio-purple" />
        <h2 className="font-semibold text-gray-900">Flagged from the app</h2>
        <span className="text-xs text-gray-500">{candidates.length} waiting</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {candidates.map((c) => (
          <CandidateRow
            key={c.id}
            candidate={c}
            onStart={onStart}
            onDismiss={onDismiss}
            onOpenStory={(id) => navigate(`/admin/stories/${id}`)}
            busy={start.isPending || dismiss.isPending}
          />
        ))}
      </ul>
    </section>
  )
}
