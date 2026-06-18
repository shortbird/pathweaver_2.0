import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { treehouseAPI } from '../../services/api'
import { useTreehouseProfile } from '../../hooks/useTreehouseProfile'

/**
 * F2: "I need help" / "I'm proud of this!" buttons rendered INSIDE a quest (and
 * optionally scoped to a task) so a Treehouse learner can signal right where they
 * are instead of going back to the home screen. Both alert the facilitator
 * (cohort-scoped, server-side). Only renders for Treehouse student members.
 */
export default function TreehouseSignalBar({ questId, taskId }) {
  const { isMember, isFacilitator } = useTreehouseProfile()
  const [sent, setSent] = useState(null)   // 'help' | 'proud' | null

  // Students only — facilitators don't signal themselves.
  if (!isMember || isFacilitator) return null

  const send = async (signalType) => {
    try {
      await treehouseAPI.createSignal({ signal_type: signalType, quest_id: questId, task_id: taskId })
      setSent(signalType)
      toast.success(signalType === 'help' ? 'A grown-up is on the way! 🙋' : 'Awesome — your facilitator will see this! 🎉')
      setTimeout(() => setSent(null), 4000)
    } catch {
      toast.error('Could not send. Try again or ask a grown-up.')
    }
  }

  return (
    <div className="flex gap-3 my-3">
      <button
        onClick={() => send('help')}
        disabled={sent === 'help'}
        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-sky-100 text-sky-800 font-bold text-lg active:scale-95 transition disabled:opacity-60"
      >
        🙋 I need help
      </button>
      <button
        onClick={() => send('proud')}
        disabled={sent === 'proud'}
        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-yellow-100 text-yellow-800 font-bold text-lg active:scale-95 transition disabled:opacity-60"
      >
        🎉 I'm proud of this!
      </button>
    </div>
  )
}
