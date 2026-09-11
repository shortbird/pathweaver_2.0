import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * Which school a guardian's student belongs to.
 *
 * Family endpoints take ?organization_id=, and a guardian can have children at
 * two schools, so nearly every family read starts by resolving this. The lookup
 * was written out by hand in StudentSchedulePreview and again in
 * FamilyStudentSchedulePage; a third copy is where they would start to drift.
 *
 * Returns { organizationId, organizationName } or null when the student is not
 * in a SIS school — which is the common case platform-wide and is not an error.
 */
export const useFamilyStudentOrg = (studentId, options = {}) => useQuery({
  queryKey: queryKeys.family.studentOrg(studentId),
  queryFn: async () => {
    const { data } = await api.get('/api/sis/parent/context')
    const org = (data?.orgs || []).find(
      (o) => (o.students || []).some((s) => s.student_id === studentId))
    if (!org) return null
    return {
      organizationId: org.organization_id,
      organizationName: org.organization_name,
    }
  },
  enabled: !!studentId,
  retry: false,
  staleTime: 5 * 60 * 1000,
  ...options,
})

export default useFamilyStudentOrg
