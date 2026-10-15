import { useSisParentContext } from './useSchoolContext'

/**
 * Which school a guardian's student belongs to.
 *
 * Family endpoints take ?organization_id=, and a guardian can have children at
 * two schools, so nearly every family read starts by resolving this. The lookup
 * was written out by hand in StudentSchedulePreview and again in
 * FamilyStudentSchedulePage; a third copy is where they would start to drift.
 *
 * Returns { organizationId, organizationName, org } or null when the student is
 * not in a SIS school — which is the common case platform-wide and is not an
 * error. `org` is the context's own entry, for its module list.
 */
export const useFamilyStudentOrg = (studentId, options = {}) => {
  // Derived from the one shared context read (useSchoolContext) rather than
  // a fetch of its own, since 2026-09-15.
  const { orgs, loading, isError } = useSisParentContext({ enabled: !!studentId, ...options })
  const org = (orgs || []).find(
    (o) => (o.students || []).some((s) => s.student_id === studentId))
  const pending = Boolean(studentId) && orgs === null
  return {
    data: !studentId || orgs === null ? undefined
      : org ? { organizationId: org.organization_id, organizationName: org.organization_name, org } : null,
    isLoading: loading,
    isPending: pending,
    isError,
  }
}

export default useFamilyStudentOrg
