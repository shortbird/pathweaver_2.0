import React from 'react'
import AiCriteriaChecklist from '../AiCriteriaChecklist'
import StatusTimeline from '../StatusTimeline'
import { criteriaForDisplay } from '../aiReview'

/**
 * What the student was asked to do, and what "done" means.
 *
 * Sits above the evidence so the reviewer reads the standard before the work.
 * The Definition of Done is the school's list; the AI only annotates it. A task
 * that set no criteria says so out loud rather than leaving a gap the reviewer
 * has to notice, because judging against an unstated standard is where two
 * reviewers stop agreeing.
 */
const GraderTaskCard = ({
  task, quest, student, completion, isOrgStudent,
  aiReview, onJumpToEvidence, readableRefs,
}) => {
  const hasCriteria = criteriaForDisplay(task, aiReview).length > 0
  const studentName = `${student?.first_name || ''} ${student?.last_name || ''}`.trim()
    || student?.display_name || 'Student'

  return (
    <section aria-labelledby="grader-task-title" className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-optio-purple mb-1">
          Task
        </p>
        <h2 id="grader-task-title" className="text-xl md:text-2xl font-bold text-gray-900 leading-snug break-words">
          {task?.title || 'Unknown Task'}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{studentName}</span>
          <span> in </span>
          <span className="font-medium text-gray-700">{quest?.title || 'Unknown Quest'}</span>
        </p>
      </div>

      <div className="max-w-xs">
        <StatusTimeline
          diplomaStatus={completion?.diploma_status}
          isOrgStudent={isOrgStudent}
          orgReviewerId={completion?.org_reviewer_id}
        />
      </div>

      {task?.description && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Instructions
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      {hasCriteria ? (
        <AiCriteriaChecklist
          criteria={task?.success_criteria}
          aiReview={aiReview}
          onJumpToEvidence={onJumpToEvidence}
          readableRefs={readableRefs}
        />
      ) : (
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Definition of Done
          </p>
          <p className="text-sm text-gray-500">
            This task set no criteria. Judge the work against the instructions above.
          </p>
        </div>
      )}
    </section>
  )
}

export default GraderTaskCard
