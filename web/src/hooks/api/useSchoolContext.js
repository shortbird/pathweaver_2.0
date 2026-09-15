import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'
import { useFamilyScope } from '../../contexts/FamilyScopeContext'

const EMPTY = Object.freeze([])

const SILENT = {
  retry: false,
  refetchOnWindowFocus: false,
  staleTime: 5 * 60 * 1000,
}

/**
 * The two "which school am I in" reads every family page starts with, made
 * once each and shared through react-query.
 *
 * Until 2026-09-15 eleven pages each fetched /api/sis/parent/context on mount
 * with their own useState/useEffect, and three more fetched
 * /api/sis/school/context the same way, so a parent moving from Billing to
 * Requests to Absences paid the lookup three times and each page rendered its
 * own org and student pickers over the same answer. These hooks are keyed by
 * the signed-in user so a masquerade swap is not served the previous
 * person's schools.
 *
 * Both degrade to "no schools" on failure: a platform family with no SIS
 * school is the common case, and not an error. Neither is keyed by the
 * signed-in user: logout clears the whole query cache (AuthContext) and a
 * masquerade swap reloads the page, so the cache never outlives the person.
 */

/**
 * Where this person is a GUARDIAN: /api/sis/parent/context. `orgs` is null
 * while loading, then the array the endpoint returns (organization_id,
 * organization_name, students[], modules[], post_registration_flow, ...).
 */
export function useSisParentContext(options = {}) {
  const query = useQuery({
    queryKey: queryKeys.family.sisContext(),
    queryFn: async () => {
      const { data } = await api.get('/api/sis/parent/context')
      return data?.orgs || []
    },
    ...SILENT,
    ...options,
  })
  return {
    orgs: query.data ?? null,
    loading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

/**
 * Where this person is a MEMBER: /api/sis/school/context, which reports
 * guardianship separately (a student at the school is a member and not a
 * guardian). `orgs` is null while loading, then the array.
 */
export function useSchoolContext(options = {}) {
  const query = useQuery({
    queryKey: queryKeys.family.schoolContext(),
    queryFn: async () => {
      const { data } = await api.get('/api/sis/school/context')
      return { orgs: data?.orgs || [], isGuardian: Boolean(data?.is_guardian) }
    },
    ...SILENT,
    ...options,
  })
  return {
    orgs: query.data?.orgs ?? null,
    isGuardian: query.data?.isGuardian ?? false,
    loading: query.isLoading,
  }
}

export default useSchoolContext

/**
 * The org and student pickers every guardian page starts with, over the
 * shared context read: which of the family's schools is selected (the first
 * by default, or the one the scoped child attends), that org's students,
 * and which of them is the child the parent already picked on the family
 * dashboard (contexts/FamilyScopeContext) -- so a page can default its own
 * student picker to the child the parent is working with rather than to
 * "the first one in the list".
 *
 * `loading` is true until the context has answered once. `orgs` is [] for a
 * family with no SIS school, which the pages render as their empty state.
 */
export function useFamilyOrgSelection() {
  const { orgs, loading, isError } = useSisParentContext()
  const { selectedChild } = useFamilyScope()
  const [orgId, setOrgId] = useState('')

  useEffect(() => {
    if (orgId || !orgs?.length) return
    const scoped = selectedChild
      && orgs.find((o) => (o.students || []).some((s) => s.student_id === selectedChild.id))
    setOrgId((scoped || orgs[0]).organization_id)
  }, [orgs, orgId, selectedChild])

  const org = (orgs || []).find((o) => o.organization_id === orgId) || null
  // Stable identity: pages hang effects off `students`, and a fresh [] every
  // render would re-run them (and their setState) in a loop.
  const students = useMemo(() => org?.students || EMPTY, [org])
  const scopedStudentId = selectedChild && students.some((s) => s.student_id === selectedChild.id)
    ? selectedChild.id
    : ''

  return {
    orgs: orgs || EMPTY,
    org,
    orgId,
    setOrgId,
    students,
    scopedStudentId,
    loading,
    isError,
  }
}
