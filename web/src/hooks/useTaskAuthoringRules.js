import { useEffect, useState } from 'react'
import api from '../services/api'
import { useStudentScope } from './useStudentScope'

/**
 * What the family writing a task is held to, for the school whose task it is.
 *
 *   const { rules, loading } = useTaskAuthoringRules({ taskId })
 *   rules.requires_success_criteria  // the Definition of Done is mandatory
 *   rules.can_edit_xp                // may pick or change the task's XP
 *   rules.criteria_locked            // only with taskId: sent for credit once
 *
 * Asked of the server (GET /api/tasks/authoring-rules) rather than derived from
 * the contexts, because in family scope the answer belongs to the CHILD's
 * school, and the contexts only know the signed-in parent's. The route is
 * @student_scope, so the scope params travel with it like every other
 * delegated read.
 *
 * A plain effect, not React Query: useCanEditXp calls this from components
 * that render with no providers at all (modals in isolation, public pages), and
 * useQuery throws without a QueryClient. Two callers on one screen (the form
 * and useCanEditXp) share the in-flight request instead of asking twice.
 *
 * `rules` is null until the answer arrives, and stays null when the request
 * fails; callers fall back to their own default, which is the pre-rules
 * behaviour. The server enforces the same rules on save either way.
 */
const inFlight = new Map()

const fetchRules = (params) => {
  const key = JSON.stringify(params)
  if (!inFlight.has(key)) {
    const request = Promise.resolve(api.get('/api/tasks/authoring-rules', { params }))
      .finally(() => inFlight.delete(key))
    inFlight.set(key, request)
  }
  return inFlight.get(key)
}

export default function useTaskAuthoringRules({ taskId = null, enabled = true } = {}) {
  const { scopeId } = useStudentScope()
  // The answer is remembered with the request it answers, so a change of
  // child or task reads as "loading" at once instead of showing the previous
  // child's rules for a render.
  const requestKey = enabled ? `${scopeId || 'self'}|${taskId || ''}` : null
  const [answer, setAnswer] = useState({ key: null, rules: null, error: null })

  useEffect(() => {
    if (!requestKey) return undefined
    let cancelled = false
    const params = scopeId ? { student_id: scopeId } : {}
    if (taskId) params.task_id = taskId
    fetchRules(params)
      .then((response) => {
        if (cancelled) return
        const data = response?.data
        setAnswer({ key: requestKey, rules: data && data.success !== false ? data : null, error: null })
      })
      .catch((err) => {
        if (!cancelled) setAnswer({ key: requestKey, rules: null, error: err })
      })
    return () => { cancelled = true }
  }, [requestKey, scopeId, taskId])

  const current = requestKey !== null && answer.key === requestKey
  return {
    rules: current ? answer.rules : null,
    loading: requestKey !== null && !current,
    error: current ? answer.error : null,
  }
}
