// Unread teacher feedback, at the top of the quest page.
//
// Horizon, ticket 4ea811d6 (2026-10-07): "Teacher feedback lands in chat or
// the inbox with a small badge, and students miss it. A banner or pop-up
// attached to the quest itself would make sure they see it."
//
// `count` and `feedback` come from GET /api/quests/<id>
// (unread_feedback_count, latest_feedback). Both are set only for the student
// viewing their own quest, so a parent in family scope never sees this.
// "Read feedback" opens the task; the thread there marks the note read, and
// the banner goes once the count reaches 0.
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'

export default function TeacherFeedbackBanner({ count = 0, feedback, onRead }) {
  if (!count || count < 1 || !feedback) return null
  const taskTitle = feedback.task_title || 'a task'
  const more = count - 1
  return (
    <div
      role="status"
      data-testid="teacher-feedback-banner"
      className="mb-4 rounded-xl border border-optio-purple/30 bg-optio-purple/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className="w-9 h-9 rounded-lg bg-optio-purple/10 text-optio-purple flex items-center justify-center flex-shrink-0">
          <ChatBubbleLeftRightIcon className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            Your teacher left feedback on {taskTitle}
          </p>
          {feedback.preview && (
            <p className="text-sm text-gray-700 mt-1 break-words">
              {feedback.author_name ? <span className="font-medium">{feedback.author_name}: </span> : null}
              {feedback.preview}
            </p>
          )}
          {more > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {more === 1 ? '1 more new note on this quest' : `${more} more new notes on this quest`}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRead?.(feedback)}
        className="btn-primary min-h-[44px] touch-manipulation self-start sm:self-center flex-shrink-0"
      >
        Read feedback
      </button>
    </div>
  )
}
