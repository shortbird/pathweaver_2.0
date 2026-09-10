import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * What the school has recorded for a guardian's student.
 *
 * Families had no way to see this. A parent could report an absence and never
 * find out what came of it — including whether the absence they phoned in had
 * been marked excused, which is why they phoned.
 *
 * Same silent-failure shape as useStudentClassMaterials beside it: the request
 * 404s for a school with the attendance module off and 403s for an observer,
 * and neither is a fault a family should be shown. The caller renders nothing.
 */
export const useStudentAttendance = (studentId, { classId, ...options } = {}) => useQuery({
  queryKey: queryKeys.family.attendance(studentId, classId),
  queryFn: async () => {
    const { data } = await api.get(`/api/sis/parent/students/${studentId}/attendance`,
      { params: classId ? { class_id: classId } : undefined })
    return { records: data?.records || [], summary: data?.summary || null }
  },
  enabled: !!studentId,
  retry: false,
  staleTime: 5 * 60 * 1000,
  ...options,
})

export default useStudentAttendance
