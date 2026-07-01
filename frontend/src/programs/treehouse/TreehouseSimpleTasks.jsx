import React, { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useCompleteTask } from '../../hooks/api/useQuests'
import ModalOverlay from '../../components/ui/ModalOverlay'
import TreehouseSignalBar from './TreehouseSignalBar'

/**
 * F1: simplified "littles" task view for young Treehouse learners (cohort
 * ui_mode='simple'). Big task buttons with a checkmark; tapping an unfinished
 * task opens a friendly sheet that finishes it — with an immediate camera option
 * (photo attaches as the task's evidence) or a one-tap "just finish" (evidence is
 * optional for Treehouse). Reuses the standard completion endpoint so XP + quest
 * completion behave exactly like the normal flow.
 */
export default function TreehouseSimpleTasks({ tasks = [], questId }) {
  const { user } = useAuth()
  const completeTask = useCompleteTask()
  const [openTask, setOpenTask] = useState(null)
  const [busy, setBusy] = useState(false)

  const finish = async (task, file) => {
    setBusy(true)
    try {
      let evidence
      if (file) {
        evidence = new FormData()
        evidence.append('evidence_type', 'image')
        evidence.append('file', file)
      } else {
        evidence = {} // Treehouse evidence-optional → backend completes without evidence
      }
      await completeTask.mutateAsync({ taskId: task.id, evidence, userId: user?.id })
      setOpenTask(null)
    } catch {
      /* useCompleteTask surfaces its own error toast */
    } finally {
      setBusy(false)
    }
  }

  const onPhoto = (task) => (e) => {
    const file = e.target.files?.[0]
    if (file) finish(task, file)
  }

  const sorted = [...tasks].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  return (
    <div className="p-4 h-full overflow-y-auto">
      <ul className="space-y-3 max-w-xl mx-auto">
        {sorted.map((task) => (
          <li key={task.id}>
            <button
              onClick={() => !task.is_completed && setOpenTask(task)}
              disabled={task.is_completed}
              className={`w-full flex items-center gap-4 p-5 rounded-3xl text-left text-xl font-bold transition active:scale-[0.98] ${
                task.is_completed
                  ? 'bg-green-50 text-green-700'
                  : 'bg-white border-2 border-optio-purple/30 text-neutral-900 shadow-sm'
              }`}
            >
              <span className={`flex items-center justify-center w-12 h-12 rounded-full text-2xl shrink-0 ${
                task.is_completed ? 'bg-green-500 text-white' : 'bg-optio-purple/10 text-optio-purple'
              }`}>
                {task.is_completed ? '✓' : '○'}
              </span>
              <span className="flex-1">{task.title}</span>
            </button>
          </li>
        ))}
        {sorted.length === 0 && <li className="text-neutral-400 text-center">No tasks yet.</li>}
      </ul>

      {/* Finish sheet */}
      {openTask && (
        <ModalOverlay onClose={() => !busy && setOpenTask(null)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-md">
            <p className="text-2xl font-bold text-neutral-900 text-center">{openTask.title}</p>
            <p className="text-neutral-500 text-center mt-1">Finished it? Take a photo of your work!</p>

            <div className="mt-6 space-y-3">
              <label className={`block w-full text-center py-4 rounded-2xl bg-gradient-to-r from-optio-purple to-optio-pink text-white text-lg font-bold cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
                📷 Take a photo & finish
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto(openTask)} />
              </label>
              <button
                onClick={() => finish(openTask, null)}
                disabled={busy}
                className="w-full py-4 rounded-2xl bg-green-100 text-green-800 text-lg font-bold disabled:opacity-60"
              >
                ✓ Just finish
              </button>
            </div>

            {/* Help / proud right where they are */}
            <TreehouseSignalBar questId={questId} taskId={openTask.id} />

            <button onClick={() => setOpenTask(null)} disabled={busy}
              className="w-full mt-2 py-3 text-neutral-500 font-semibold">
              ← Back
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
