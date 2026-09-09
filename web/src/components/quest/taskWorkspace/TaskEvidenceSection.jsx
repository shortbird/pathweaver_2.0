// The student's own work on this task: the evidence blocks, the add/complete
// controls, and -- once complete -- diploma credit, portfolio curation and any
// feedback a teacher has left.
import { CheckCircleIcon, ExclamationCircleIcon, PlusIcon, AcademicCapIcon, BookmarkIcon } from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import EvidenceDisplay from '../../evidence/EvidenceDisplay';
import CreditFeedbackThread from '../../credit/CreditFeedbackThread';
import { Spinner, ButtonSpinner } from '../../ui';

const TaskEvidenceSection = ({ canRequestCredit, creditStatus, error, evidenceBlocks, handleDeleteEvidence, handleDeleteItem, handleEditEvidence, handleMarkComplete, handleReorder, handleRequestCredit, handleTogglePortfolio, isClassQuest, isCompleting, isLoading, isRequestingCredit, isSaving, isTaskCompleted, isTogglingPortfolio, portfolioPick, setIsModalOpen, task }) => (
  <>
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-3 sm:px-6 py-2 sm:py-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap">
          My Evidence
        </h3>
        <div className="flex items-center gap-1 sm:gap-2">
          {/* There is no Save button. Evidence saves itself: adding,
              editing, deleting and reordering each call saveEvidence
              on the spot, so the button only ever re-posted blocks
              that were already stored. It sat first in a row of five
              controls and read as the thing you had to press. */}
          {isSaving && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400" role="status">
              <Spinner size="sm" />
              <span className="hidden sm:inline">Saving…</span>
            </span>
          )}

          {/* Add Evidence Button - icon only on mobile */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-sm font-medium text-optio-purple hover:bg-optio-purple/10 border border-optio-purple/30 rounded-lg transition-colors min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 touch-manipulation"
            title="Add Evidence"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Add</span>
          </button>

          {/* Mark Complete Button - compact on mobile */}
          {!isTaskCompleted ? (
            <button
              onClick={handleMarkComplete}
              disabled={isCompleting || isSaving}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-semibold bg-gradient-primary text-white rounded-lg hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px] touch-manipulation"
            >
              {isCompleting ? (
                <ButtonSpinner />
              ) : (
                <>
                  <CheckCircleIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Done</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {/* Plain text, not a bordered pill. The tick already
                  says "completed", so the word was saying it twice,
                  and boxing a status made it compete with the two
                  real buttons beside it. */}
              <span className="flex items-center gap-1 text-green-700 text-xs sm:text-sm font-semibold whitespace-nowrap">
                <CheckCircleIcon className="w-4 h-4 text-green-600" />
                +{task.xp_amount} XP
              </span>
              {/* Per-task diploma credit. Hidden inside a class quest —
                  there, credit is requested at the class level once the
                  XP requirement is met (see the class progress panel). */}
              {!isClassQuest && canRequestCredit && (creditStatus === 'none' || creditStatus === 'grow_this') && (
                <button
                  onClick={handleRequestCredit}
                  disabled={isRequestingCredit}
                  className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-optio-purple bg-optio-purple/10 hover:bg-optio-purple/20 border border-optio-purple/30 rounded-lg transition-colors disabled:opacity-50 min-h-[32px] touch-manipulation"
                  title={creditStatus === 'grow_this' ? 'Resubmit for diploma credit' : 'Request diploma credit for this task'}
                >
                  {isRequestingCredit ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
                      <AcademicCapIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">
                        {creditStatus === 'grow_this' ? 'Resubmit' : 'Request Credit'}
                      </span>
                    </>
                  )}
                </button>
              )}
              {!isClassQuest && creditStatus === 'pending_review' && (
                <span className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                  <AcademicCapIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Awaiting Review</span>
                </span>
              )}
              {!isClassQuest && creditStatus === 'pending_org_approval' && (
                <span className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-optio-purple bg-optio-purple/5 border border-optio-purple/20 rounded-lg">
                  <AcademicCapIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Awaiting Org Review</span>
                </span>
              )}
              {!isClassQuest && creditStatus === 'finalized' && (
                <span className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg">
                  <AcademicCapIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Credit Approved</span>
                </span>
              )}
              {/* Portfolio curation: only rendered when this completion
                  belongs to the viewer (the lookup 404s otherwise). */}
              {portfolioPick && (
                <button
                  onClick={handleTogglePortfolio}
                  disabled={isTogglingPortfolio}
                  className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium border rounded-lg transition-colors disabled:opacity-50 min-h-[32px] touch-manipulation ${
                    portfolioPick.inPortfolio
                      ? 'text-optio-purple bg-optio-purple/10 border-optio-purple/40'
                      : 'text-gray-600 bg-white border-gray-300 hover:border-optio-purple/40 hover:text-optio-purple'
                  }`}
                  title={portfolioPick.inPortfolio ? 'Remove from portfolio picks' : 'Include in portfolio'}
                  aria-label={portfolioPick.inPortfolio ? 'Remove from portfolio picks' : 'Include in portfolio'}
                  aria-pressed={portfolioPick.inPortfolio}
                >
                  {/* Icon only. "Include in portfolio" was the widest
                      thing in the row for a toggle whose filled/empty
                      bookmark already says which way it is set. */}
                  {portfolioPick.inPortfolio ? (
                    <BookmarkSolidIcon className="w-4 h-4" />
                  ) : (
                    <BookmarkIcon className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    <div className="p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <ExclamationCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <Spinner size="sm" />
            <span className="text-gray-500 text-sm">Loading evidence...</span>
          </div>
        </div>
      ) : (
        <EvidenceDisplay
          blocks={evidenceBlocks}
          onDelete={handleDeleteEvidence}
          onDeleteItem={handleDeleteItem}
          onReorder={handleReorder}
          onEdit={handleEditEvidence}
          emptyMessage="No evidence yet. Click 'Add Evidence' to show your work."
        />
      )}

      {/* A teacher's feedback on submitted work, where the student is
          already standing. The thread existed and was written to from
          the SIS submissions inbox, but the student's only view of it
          was folded inside the Diploma page's credit tracker, so
          feedback landed somewhere they never looked -- and the
          notification pointed here, at a page that showed none of it
          (Gryffin, 2026-08-31: "I submitted feedback on one of the
          submissions, and the student doesn't see it anywhere").
          completionId comes from loadPortfolioPick, already fetched
          for every completed task. */}
      {task.is_completed && portfolioPick?.completionId && (
        <CreditFeedbackThread completionId={portfolioPick.completionId} />
      )}
    </div>
  </>
);

export default TaskEvidenceSection;
