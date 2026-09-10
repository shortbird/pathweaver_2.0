import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * Handouts a guardian's student can read, grouped by class.
 *
 * Not org-keyed, unlike the SIS console hooks beside it: the endpoint is scoped
 * by the student, who belongs to exactly one school, and the guardian is never
 * switching orgs the way a superadmin does.
 *
 * A failure is not surfaced as an error state. The request 404s for a school
 * with the classes module off and 403s for an observer, and neither is a fault
 * a family should be shown -- the caller renders nothing. Retries are off for
 * the same reason: both are settled answers, not blips worth asking again.
 */
export const useStudentClassMaterials = (studentId, options = {}) => useQuery({
  queryKey: queryKeys.family.classMaterials(studentId),
  queryFn: async () => {
    const { data } = await api.get(`/api/sis/parent/students/${studentId}/materials`)
    return data?.classes || []
  },
  enabled: !!studentId,
  retry: false,
  staleTime: 5 * 60 * 1000,
  ...options,
})

export default useStudentClassMaterials
