import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * Handouts the SIGNED-IN student's own classes share, grouped by class.
 *
 * The student twin of useStudentClassMaterials. Takes no id because there is
 * nothing to pass: the endpoint reads the caller's own active enrollments.
 *
 * Same failure disposition as the guardian hook, and for the same reasons: the
 * request 404s for a school with the classes module off, and anyone who is not
 * a student -- a guardian, a teacher, staff -- simply has no enrollments and
 * gets an empty list. None of those is a fault worth showing or retrying.
 */
export const useMyClassMaterials = (options = {}) => useQuery({
  queryKey: queryKeys.family.myClassMaterials(),
  queryFn: async () => {
    const { data } = await api.get('/api/sis/student/materials')
    return data?.classes || []
  },
  retry: false,
  staleTime: 5 * 60 * 1000,
  ...options,
})

export default useMyClassMaterials
