import { useState } from 'react'
import { UsersIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'

/**
 * "Give students this task list" — for the teacher who built a quest by
 * picking it up themselves.
 *
 * That is how quests actually get built: create it, pick it up, take the AI
 * paths you like, add a few more from the wizard. The list that results lives
 * only on the teacher's enrollment, so a student picking the quest up was sent
 * to the build-your-own wizard instead, and the only way to hand them the
 * teacher's list was to retype it into the quest form (Apogee Odessa,
 * 2026-09-14: six quests, about sixty tasks).
 *
 * Shows only while the quest has no authored task list yet — once it has one
 * the quest form is the editor for it — and only to someone the backend will
 * let do it: staff on their own org's quest, or a superadmin. Renders nothing
 * otherwise, so a student never sees it.
 */
export default function GiveStudentsMyTasksCard({ quest, onDone }) {
  const { user, hasAnyRole } = useAuth()
  const [busy, setBusy] = useState(false)

  const tasks = quest?.quest_tasks || []
  const isSuperadmin = hasAnyRole?.(['superadmin'])
  const isOrgStaff = hasAnyRole?.(['org_admin', 'advisor'])
    && !!quest?.organization_id
    && quest.organization_id === user?.organization_id
  const canGive = (isSuperadmin || isOrgStaff)
    && !!quest?.user_enrollment
    && !quest?.has_template_tasks
    && tasks.length > 0

  if (!canGive) return null

  const handleGive = async () => {
    setBusy(true)
    try {
      // `{}` and not nothing: a bodiless POST has no Content-Type and the
      // backend refuses it before the route runs.
      const { data } = await api.post(`/api/admin/quests/${quest.id}/template-tasks/from-my-tasks`, {})
      // resynced.enrollments counts every enrollment the list was carried to,
      // the teacher's own included; the others are students who had already
      // picked the quest up.
      const others = Math.max((data?.resynced?.enrollments || 0) - 1, 0)
      toast.success(
        others > 0
          ? `Students now get your ${data.total} tasks. ${others} who already picked it up ${others === 1 ? 'has' : 'have'} them too.`
          : `Students now get your ${data.total} tasks.`,
      )
      onDone?.()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not give students this task list.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-3 rounded-xl border border-optio-purple/30 bg-optio-purple/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 text-sm text-gray-700">
        <p className="font-semibold text-gray-900">Only you have this task list so far.</p>
        <p>
          Students who pick up this quest are asked to build their own. Give them
          your {tasks.length} task{tasks.length === 1 ? '' : 's'} instead, including
          anyone who has already picked it up.
        </p>
      </div>
      <button
        type="button"
        onClick={handleGive}
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-optio-purple text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition min-h-[44px] touch-manipulation disabled:opacity-50"
      >
        <UsersIcon className="w-4 h-4" />
        {busy ? 'Giving...' : 'Give students this task list'}
      </button>
    </div>
  )
}
