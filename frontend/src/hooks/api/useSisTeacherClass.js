import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * One class as its teacher sees it: the class row, its supply budget, its roster.
 *
 * QF-03, 2026-09-04. TeacherClassPage spread this response across three
 * `useState`s and a fourth for loading. They arrive together and are only ever
 * set together, so they are one query -- which also removes the window where a
 * re-fetch had written `cls` but not yet `students`.
 *
 * Keyed on classId as well as orgId: a teacher moving between two classes was
 * previously shown the previous class's roster until the new request landed,
 * because the state was reused across the id change.
 */
export const useSisTeacherClass = (orgId, classId, options = {}) => useQuery({
  queryKey: queryKeys.sis.teacherClassRoster(orgId, classId),
  queryFn: async () => {
    const res = await api.get(withOrg(`/api/sis/teacher/classes/${classId}/roster`, orgId))
    return {
      cls: res.data?.class ?? null,
      budget: res.data?.supply_budget || null,
      students: res.data?.students || [],
    }
  },
  enabled: !!orgId && !!classId,
  staleTime: 30 * 1000,
  ...options,
})

export default useSisTeacherClass
