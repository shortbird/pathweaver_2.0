/**
 * Iframe quest detail (v1).
 *
 * Reached after a student clicks an Optio assignment in Canvas. The launch
 * handler resolves the quest_id, mints tokens, and redirects here. We
 * auto-enroll the student if not enrolled, surface the AI personalization
 * CTA until they have at least one task, then show tasks with simple
 * text-evidence inputs.
 *
 * Quest auto-completes when all required tasks are done — at that point
 * the backend's atomic_quest_service triggers AGS grade sync to Canvas
 * and the student sees a "submitted to your teacher" state.
 *
 * Deliberately compact — the full QuestDetail page is too dense to embed
 * in a Canvas iframe and depends on Layout chrome we don't have here.
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import api from '../../services/api'

export default function LtiQuestPage() {
  const { id: questId } = useParams()
  const [quest, setQuest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [enrollAttempted, setEnrollAttempted] = useState(false)

  const fetchQuest = useCallback(async () => {
    if (!questId) return
    try {
      setLoading(true)
      const { data } = await api.get(`/api/quests/${questId}`)
      setQuest(data.quest || data)
      setError(null)
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load quest')
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
      api.post(`/api/quests/${questId}/enroll`, {})
        .then(() => fetchQuest())
        .catch(() => {
          // Surfaces in error state on next fetch attempt
        })
    }
  }, [quest, enrollAttempted, questId, fetchQuest])

  const generateInitialTasks = async (interest) => {
    // Start a personalization session, generate tasks, accept the first 3.
    const session = await api.post(`/api/quests/${questId}/start-personalization`, {})
    const sessionId = session.data?.session_id
    if (!sessionId) throw new Error('Could not start personalization')

    const generated = await api.post(`/api/quests/${questId}/generate-tasks`, {
      session_id: sessionId,
      approach: 'hybrid',
      interests: interest ? [interest] : [],
      cross_curricular_subjects: [],
      exclude_tasks: [],
    })
    const tasks = generated.data?.tasks || generated.data?.generated_tasks || []
    for (const task of tasks.slice(0, 3)) {
      await api.post(`/api/quests/${questId}/personalization/accept-task`, {
        session_id: sessionId,
        task,
      })
    }
    await fetchQuest()
  }

  const completeTaskWithText = async (taskId, evidenceText) => {
    await api.post(`/api/evidence/documents/${taskId}`, {
      blocks: [{ type: 'text', content: { text: evidenceText } }],
      status: 'completed',
    })
    await fetchQuest()
  }

  if (loading || !quest) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-red-600 text-center">{error}</p>
      </div>
    )
  }

  const tasks = quest.quest_tasks || []
  const completedCount = tasks.filter((t) => t.is_completed).length
  const allDone = tasks.length > 0 && completedCount === tasks.length
  const submitted = !!quest.completed_enrollment && !quest.user_enrollment

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{quest.title}</h1>
          {quest.description && (
            <p className="mt-2 text-base text-gray-600">{quest.description}</p>
          )}
        </div>

        {submitted ? (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="font-semibold text-gray-900">Submitted to your teacher</h2>
            <p className="mt-2 text-sm text-gray-600">
              Your teacher will see your evidence in Canvas SpeedGrader.
              You can keep adding to your portfolio in Optio anytime.
            </p>
          </div>
        ) : tasks.length === 0 ? (
          <PersonalizeCta onGenerate={generateInitialTasks} />
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onComplete={(text) => completeTaskWithText(task.id, text)}
              />
            ))}
            {allDone && !submitted && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm text-gray-600">
                  All tasks complete — your submission is on its way to Canvas.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PersonalizeCta({ onGenerate }) {
  const [interest, setInterest] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const handle = async () => {
    setErr(null)
    setBusy(true)
    try {
      await onGenerate(interest.trim())
    } catch (e) {
      setErr(e?.response?.data?.error || e?.message || 'Could not generate tasks')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Plan your approach</h2>
        <p className="mt-1 text-sm text-gray-600">
          Tell Optio what you're into — sports, music, video games, code,
          cooking, anything — and we'll generate tasks that connect this
          assignment to it.
        </p>
      </div>
      <input
        type="text"
        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-optio-purple"
        placeholder="e.g. skateboarding, robotics, baking"
        value={interest}
        onChange={(e) => setInterest(e.target.value)}
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex justify-end">
        <button
          onClick={handle}
          disabled={busy}
          className="px-4 py-2 rounded-md bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate tasks'}
        </button>
      </div>
    </div>
  )
}

function TaskRow({ task, onComplete }) {
  const [evidence, setEvidence] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState(null)

  if (task.is_completed) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">{task.title}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            Completed
          </span>
        </div>
        {task.description && (
          <p className="mt-1 text-sm text-gray-600">{task.description}</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">{task.title}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
          {task.xp_value} XP
        </span>
      </div>
      {task.description && (
        <p className="text-sm text-gray-600">{task.description}</p>
      )}
      <textarea
        className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-optio-purple"
        rows={3}
        placeholder="Write what you did, learned, or made"
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
      />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex justify-end">
        <button
          disabled={submitting || !evidence.trim()}
          onClick={async () => {
            setErr(null)
            setSubmitting(true)
            try {
              await onComplete(evidence.trim())
            } catch (e) {
              setErr(e?.response?.data?.error || e?.message || 'Could not mark complete')
            } finally {
              setSubmitting(false)
            }
          }}
          className="px-4 py-2 rounded-md bg-optio-purple text-white font-medium disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Mark complete'}
        </button>
      </div>
    </div>
  )
}
