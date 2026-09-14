import { useMemo } from 'react'
import { useFamilyScope } from '../contexts/FamilyScopeContext'

/**
 * What a data hook needs from the family scope, and nothing else.
 *
 *   const { studentId, params, scopeId, isDelegated } = useStudentScope()
 *   api.get('/api/users/dashboard', { params })      // ?student_id= when scoped
 *   queryKey: queryKeys.quests.detail(questId, scopeId)
 *
 * `params` is `{ student_id }` in scope and `{}` otherwise, so a hook can
 * spread it into every request without branching. `scopeId` is the value to
 * put in a React Query key (the child's id, or undefined for "me"). Threaded
 * explicitly through each hook rather than injected by an axios interceptor:
 * the interceptor cannot see query keys, cannot tell PUT /api/users/profile
 * (never delegated) from a delegatable route, and hides the dependency from
 * tests.
 */
export function useStudentScope() {
  const { selectedChildId, selectedChild } = useFamilyScope()
  return useMemo(() => ({
    studentId: selectedChildId,
    scopeId: selectedChildId || undefined,
    params: selectedChildId ? { student_id: selectedChildId } : {},
    isDelegated: !!selectedChildId,
    studentName: selectedChild?.firstName || null,
  }), [selectedChildId, selectedChild])
}

export default useStudentScope
