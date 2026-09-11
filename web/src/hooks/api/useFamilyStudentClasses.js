import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'
import { useFamilyStudentOrg } from './useFamilyStudentOrg'

/**
 * A student's classes, each with the handouts that belong to it.
 *
 * A guardian's view of their child's classes was scattered across three pages
 * that did not link to each other: the schedule page had the times and the
 * teacher, the Schedule Builder had add and drop, and the materials list lived
 * on a fourth (iCreate, 2026-09-10: "parents should see classes for their kid
 * in one place", "class materials into class").
 *
 * Nothing new on the server. The schedule endpoint already returns each class
 * with its meetings and instructor, and the materials endpoint already groups
 * handouts BY CLASS — they were simply never put together. Joining them here
 * keeps one source of truth for each half.
 *
 * Returns [] rather than an error for a student outside a SIS school: that is
 * most students platform-wide, not a fault.
 */
export const useFamilyStudentClasses = (studentId, options = {}) => {
  const { data: org, isPending: orgPending } = useFamilyStudentOrg(studentId)

  const query = useQuery({
    queryKey: queryKeys.family.classes(studentId),
    queryFn: async () => {
      const [schedule, materials] = await Promise.all([
        api.get(`/api/sis/parent/students/${studentId}/schedule`,
          { params: { organization_id: org.organizationId } }),
        // Handouts are a bonus, not a precondition: a school with the classes
        // module off 404s here, and the class list is still worth showing.
        api.get(`/api/sis/parent/students/${studentId}/materials`).catch(() => null),
      ])

      const byClass = new Map(
        ((materials?.data?.classes) || []).map((c) => [c.class_id, c.materials || []]))

      return (schedule.data?.classes || []).map((c) => ({
        ...c,
        materials: byClass.get(c.id) || [],
      }))
    },
    enabled: !!studentId && !!org?.organizationId,
    retry: false,
    staleTime: 5 * 60 * 1000,
    ...options,
  })

  return {
    ...query,
    classes: query.data || [],
    organizationName: org?.organizationName || '',
    // Still resolving the school counts as loading; otherwise the caller
    // renders "no classes" for a beat before the real answer arrives.
    isPending: orgPending || query.isPending,
  }
}

export default useFamilyStudentClasses
