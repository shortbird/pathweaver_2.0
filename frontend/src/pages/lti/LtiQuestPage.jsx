/**
 * Iframe quest detail (v1).
 *
 * Reached after a student clicks an Optio assignment in Canvas. The launch
 * handler resolves the quest_id, mints tokens, and redirects here. We
 * auto-enroll the student if not enrolled, then open the SAME
 * `QuestPersonalizationWizard` v1's QuestDetail page uses (single source of
 * truth — see frontend/src/components/quests/QuestPersonalizationWizard.jsx).
 *
 * Quest auto-completes when all required tasks are done — the backend's
 * atomic_quest_service triggers AGS grade sync to Canvas at that point.
 */

import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import api from '../../services/api'
import LtiShell from '../../components/lti/LtiShell'
import LtiEvidenceEditor from '../../components/lti/LtiEvidenceEditor'

// Reuse v1's wizard. Lazy-loaded so the iframe payload stays small.
const QuestPersonalizationWizard = lazy(() =>
  import('../../components/quests/QuestPersonalizationWizard'),
)

export default function LtiQuestPage() {
  const { id: questId } = useParams()
  const [quest, setQuest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [enrollAttempted, setEnrollAttempted] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  // One-shot: only auto-open the wizard on the very first quest load.
  // Without this, the auto-open useEffect re-fires when the wizard closes
  // (because `showWizard` flipped to false but the refetched quest hasn't
  // arrived yet, so hasTasks looks false), bouncing the user back to a
  // fresh step 1.
  const autoOpenedRef = useRef(false)

  const fetchQuest = useCallback(async () => {
    if (!questId) return
    try {
      setLoading(true)
      const { data } = await api.get(`/api/quests/${questId}`)
      setQuest(data.quest || data)
      setError(null)
    } catch (e) {
      const raw = e?.response?.data?.error
      const msg =
        typeof raw === 'string' ? raw : raw?.message || e?.message || 'Failed to load quest'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [questId])

  useEffect(() => {
    fetchQuest()
  }, [fetchQuest])

  // Auto-enroll on first render so the student doesn't need to press a button.
  useEffect(() => {
    if (!quest || enrollAttempted) return
    setEnrollAttempted(true)
    if (!quest.user_enrollment) {
      api
        .post(`/api/quests/${questId}/enroll`, {})
        .then(() => fetchQuest())
        .catch(() => {
          // Surfaces in error state on next fetch attempt
        })
    }
  }, [quest, enrollAttempted, questId, fetchQuest])

  // Auto-open the personalization wizard the first time a student lands on
  // an enrolled-but-empty quest. Mirrors v1 QuestDetail's first-run UX.
  // Guarded by autoOpenedRef so closing the wizard never re-triggers it.
  useEffect(() => {
    if (!quest || autoOpenedRef.current) return
    const hasTasks = (quest.quest_tasks || []).length > 0
    const enrolled = !!quest.user_enrollment
    const personalized = quest.user_enrollment?.personalization_completed
    if (enrolled && !hasTasks && !personalized) {
      autoOpenedRef.current = true
      setShowWizard(true)
    }
  }, [quest])

  // The iframe may be scrolled deep into a long task list when the wizard
  // opens. Reset our own scroll and ask Canvas to scroll the parent page to
  // the iframe top so the student sees the wizard's first step.
  useEffect(() => {
    if (!showWizard) return
    window.scrollTo(0, 0)
    try {
      window.parent.postMessage({ subject: 'lti.scrollToTop' }, '*')
    } catch {
      /* non-fatal outside Canvas */
    }
  }, [showWizard])

  const handlePersonalizationComplete = async () => {
    setShowWizard(false)
    await fetchQuest()
  }

  const handlePersonalizationCancel = () => {
    setShowWizard(false)
  }

  const completeTaskWithBlocks = async (taskId, blocks) => {
    await api.post(`/api/evidence/documents/${taskId}`, {
      blocks,
      status: 'completed',
    })
    await fetchQuest()
  }

  const removeTask = async (taskId) => {
    // Same endpoint v1's wizard uses (useQuestDetail.deleteTask). Removing
    // a completed task also drops its XP from the threshold calculation,
    // which is intentional — students can prune AI suggestions they don't
    // want without keeping artificial XP credit.
    await api.delete(`/api/tasks/${taskId}`)
    await fetchQuest()
  }

  const [submittingForGrade, setSubmittingForGrade] = useState(false)
  const [submitGradeError, setSubmitGradeError] = useState(null)
  const submitForGrading = async () => {
    setSubmitGradeError(null)
    setSubmittingForGrade(true)
    try {
      // /end is the canonical "I'm done with this quest" endpoint v1 also
      // uses. Marks user_quests.completed_at + is_active=false, fires the
      // LTI grade-sync hook which posts an AGS Score to Canvas/saLTIre.
      await api.post(`/api/quests/${questId}/end`, {})
      await fetchQuest()
    } catch (e) {
      const raw = e?.response?.data?.error
      setSubmitGradeError(
        typeof raw === 'string' ? raw : raw?.message || e?.message || 'Could not submit',
      )
    } finally {
      setSubmittingForGrade(false)
    }
  }

  const [reopening, setReopening] = useState(false)
  const [reopenError, setReopenError] = useState(null)
  const reopenQuest = async () => {
    setReopenError(null)
    setReopening(true)
    try {
      await api.post(`/api/quests/${questId}/reopen`, {})
      await fetchQuest()
    } catch (e) {
      const raw = e?.response?.data?.error
      setReopenError(
        typeof raw === 'string' ? raw : raw?.message || e?.message || 'Could not reopen',
      )
    } finally {
      setReopening(false)
    }
  }

  // Only render the shell-loading state on the very first load (when quest
  // is still null). Subsequent refetches (after completing a task) keep the
  // existing quest data on screen so the user doesn't see a full-page flash.
  if (!quest) return <LtiShell loading />
  if (error) return <LtiShell error={error} />
  const Spinner = () => (
    <div className="flex items-center justify-center py-10">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-optio-purple" />
    </div>
  )

  const tasks = quest.quest_tasks || []
  const completedCount = tasks.filter((t) => t.is_completed).length
  const allDone = tasks.length > 0 && completedCount === tasks.length

  // XP threshold + earned XP. xp_threshold is null when the teacher didn't
  // set a target — in that case the submit button is gated only by "≥1 task
  // complete". Otherwise the student has to clear the threshold to submit.
  const xpThreshold = quest.xp_threshold || 0
  const earnedXp = tasks
    .filter((t) => t.is_completed)
    .reduce((sum, t) => sum + (t.xp_value || t.xp_amount || 0), 0)
  const xpMet = xpThreshold > 0 ? earnedXp >= xpThreshold : completedCount > 0
  const xpPct = xpThreshold > 0 ? Math.min(100, (earnedXp / xpThreshold) * 100) : 0
  const canSubmit = xpMet

  // The API sets BOTH user_enrollment AND completed_enrollment when the quest
  // has no active enrollment (back-compat for v1). So `completed_enrollment`
  // alone is the signal that the student has submitted/finished.
  const submitted = !!quest.completed_enrollment

  return (
    <LtiShell
      title={quest.title}
      subtitle={quest.description || undefined}
      maxWidthClassName="max-w-3xl"
    >
      {/* The wizard replaces the task list while open (focused single-step
          iframe UX) and renders in-flow via `embedded` — a fixed-position
          modal clips inside the frameResized Canvas iframe. */}
      {showWizard ? (
        <Suspense fallback={<Spinner />}>
          <div className="bg-white rounded-xl shadow-md">
            <QuestPersonalizationWizard
              questId={quest.id}
              questTitle={quest.title}
              onComplete={handlePersonalizationComplete}
              onCancel={handlePersonalizationCancel}
              hideLibraryOption
              hideDiplomaSubjects
              embedded
            />
          </div>
        </Suspense>
      ) : (
      <div className="space-y-4">
        {submitted ? (
          <div className="bg-white rounded-xl shadow-md p-4 space-y-3">
            <div>
              <h2 className="font-semibold text-gray-900">Submitted to your teacher</h2>
              <p className="mt-2 text-sm text-gray-600">
                Your teacher will see your evidence in Canvas. You can keep
                adding to your portfolio in Optio anytime.
              </p>
            </div>
            {/* Reopen — for now student-initiated. The polling worker will
                eventually flip this to "your teacher returned this; reopen
                to revise" once Canvas-grade-state polling is wired into the
                UI. */}
            {reopenError && <p className="text-sm text-red-600">{reopenError}</p>}
            <div className="flex justify-end">
              <button
                onClick={reopenQuest}
                disabled={reopening}
                className="text-sm px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                {reopening ? 'Reopening…' : 'Reopen to revise'}
              </button>
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-4 space-y-3">
            <div>
              <h2 className="font-semibold text-gray-900">Plan your approach</h2>
              <p className="mt-1 text-sm text-gray-600">
                Optio's wizard will help you generate tasks tailored to your
                interests.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowWizard(true)}
                className="px-4 py-2 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium"
              >
                Open the wizard
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onComplete={(blocks) => completeTaskWithBlocks(task.id, blocks)}
                onRemove={() => removeTask(task.id)}
              />
            ))}
            {(canSubmit || xpThreshold > 0) && !submitted && (
              <div className="bg-white rounded-xl shadow-md p-4 space-y-3">
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {canSubmit ? 'Ready to submit?' : 'Keep going'}
                  </h2>
                  {xpThreshold > 0 ? (
                    <>
                      <p className="mt-1 text-sm text-gray-600">
                        Earn {xpThreshold} XP from your tasks to submit. Right
                        now you have <strong>{earnedXp} / {xpThreshold} XP</strong>.
                      </p>
                      <div className="mt-3 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-optio-purple to-optio-pink transition-all"
                          style={{ width: `${xpPct}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-gray-600">
                      You've completed at least one task. Submit when you're
                      ready — your teacher will review your evidence in Canvas.
                    </p>
                  )}
                </div>
                {submitGradeError && (
                  <p className="text-sm text-red-600">{submitGradeError}</p>
                )}
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {/* Generate-more lives next to Submit so it's always visible
                      when the student hasn't submitted yet — useful both for
                      "I don't have enough XP" (threshold not met) and "I
                      want to keep going" (threshold cleared but more interest). */}
                  <button
                    onClick={() => setShowWizard(true)}
                    className="text-sm px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50"
                  >
                    Generate more tasks
                  </button>
                  <button
                    onClick={submitForGrading}
                    disabled={submittingForGrade || !canSubmit}
                    className="px-4 py-2 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium disabled:opacity-50"
                  >
                    {submittingForGrade ? 'Submitting…' : 'Submit for grading'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </LtiShell>
  )
}

/**
 * Completed task — collapsed by default, expands into the multi-format
 * LtiEvidenceEditor pre-populated with the student's existing blocks when
 * they click Edit. Submit replaces the document's blocks (the backend's
 * update_document_blocks deletes + reinserts), task stays completed.
 *
 * The Remove button is intentionally absent — the API rejects deletion of
 * a completed task ("Cannot remove completed tasks"). Editing covers the
 * "I want to change my evidence" case.
 */
function CompletedTaskRow({ task, onComplete }) {
  const [editing, setEditing] = useState(false)
  const [existingBlocks, setExistingBlocks] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  const startEditing = async () => {
    setErr(null)
    setLoading(true)
    try {
      const { data } = await api.get(`/api/evidence/documents/${task.id}`)
      setExistingBlocks(data?.blocks || [])
      setEditing(true)
    } catch (e) {
      const raw = e?.response?.data?.error
      setErr(
        typeof raw === 'string' ? raw : raw?.message || e?.message || 'Could not load evidence',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-gray-900 flex-1 min-w-0">{task.title}</h3>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            Completed
          </span>
          {!editing && (
            <button
              onClick={startEditing}
              disabled={loading}
              className="text-xs px-2 py-0.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Edit'}
            </button>
          )}
        </div>
      </div>
      {task.description && !editing && (
        <p className="text-sm text-gray-600">{task.description}</p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {editing && existingBlocks !== null && (
        <LtiEvidenceEditor
          taskId={task.id}
          initialBlocks={existingBlocks}
          onCancel={() => setEditing(false)}
          onComplete={async (blocks) => {
            try {
              await onComplete(blocks)
              setEditing(false)
            } catch (e) {
              const raw = e?.response?.data?.error
              setErr(
                typeof raw === 'string'
                  ? raw
                  : raw?.message || e?.message || 'Could not save evidence',
              )
              throw e
            }
          }}
        />
      )}
    </div>
  )
}

function TaskRow({ task, onComplete, onRemove }) {
  const [err, setErr] = useState(null)
  const [removing, setRemoving] = useState(false)

  const handleRemove = async () => {
    const warn = task.is_completed
      ? `Remove "${task.title}"? You'll lose the ${task.xp_value} XP it earned.`
      : `Remove "${task.title}"?`
    if (!window.confirm(warn)) return
    setRemoving(true)
    try {
      await onRemove()
    } catch (e) {
      const raw = e?.response?.data?.error
      setErr(
        typeof raw === 'string' ? raw : raw?.message || e?.message || 'Could not remove task',
      )
    } finally {
      setRemoving(false)
    }
  }

  if (task.is_completed) {
    return <CompletedTaskRow task={task} onComplete={onComplete} />
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-gray-900 flex-1 min-w-0">{task.title}</h3>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
            {task.xp_value} XP
          </span>
          <button
            onClick={handleRemove}
            disabled={removing}
            title="Remove task"
            className="text-xs text-gray-400 hover:text-red-600 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>
      {task.description && <p className="text-sm text-gray-600">{task.description}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <LtiEvidenceEditor
        taskId={task.id}
        onComplete={async (blocks) => {
          setErr(null)
          try {
            await onComplete(blocks)
          } catch (e) {
            const raw = e?.response?.data?.error
            setErr(
              typeof raw === 'string'
                ? raw
                : raw?.message || e?.message || 'Could not mark complete',
            )
            throw e
          }
        }}
      />
    </div>
  )
}
