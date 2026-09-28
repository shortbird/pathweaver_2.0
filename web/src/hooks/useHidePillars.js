import { useContext } from 'react'
import { OrganizationContext } from '../contexts/OrganizationContext'
import { AuthContext } from '../contexts/AuthContext'
import FamilyScopeContext from '../contexts/FamilyScopeContext'
import { ageFromDob, DIPLOMA_TRACK_MIN_AGE } from '../utils/age'

/**
 * Whether to hide the five pillars: the student being viewed is 13 or older,
 * or their school has switched the pillars off.
 *
 * By age (2026-09-28): from 13 a student works toward the diploma, and the
 * diploma subject ("Language Arts") is the thing to see, not the pillar
 * ("Communication"). Under 13 the pillars stay. The student is the child a
 * parent is scoped to, or the signed-in student; staff views are unchanged.
 * An unknown age keeps the pillars, matching the task form
 * (backend/services/task_rules.py::pillars_hidden_by_age), so the form and
 * the pages around it never disagree.
 *
 *
 * The pillars (STEM / Wellness / Communication / Civics / Art) are Optio's own
 * taxonomy. A diploma school that already tracks work by school subject has two
 * parallel classifications for the same task, and families hit both when they
 * upload evidence — Hearthwood asked for theirs to be the only one after a
 * parent wrote in that "the Pillar and task sizes are so bizarre and hard to
 * make sense of" (2026-08-25).
 *
 * Off is opt-in per org: `organizations.feature_flags.hide_pillars`
 * (Organization -> Settings). When it is on, no pillar picker, chip, colour or
 * breakdown is shown to anyone in that org; the task's diploma subject stands
 * on its own and the pillar column is filled in behind the scenes from that
 * subject (backend/utils/school_subjects.py::pillar_for_subject).
 *
 * Two sources, because the two kinds of member reach a school differently:
 *  - `organization` — anyone with their own organization_id (org students,
 *    org-managed parents, staff);
 *  - `school` — platform parents, who belong through their children and carry
 *    no organization_id of their own (/api/auth/me resolves it for them).
 *
 * Reads the context directly rather than via useOrganization(), which throws
 * when the provider is absent. No provider means no org, and the platform
 * default is that pillars are shown.
 */
export default function useHidePillars() {
  const org = useContext(OrganizationContext)
  const auth = useContext(AuthContext)
  const family = useContext(FamilyScopeContext)
  if (org?.organization?.feature_flags?.hide_pillars || org?.school?.hide_pillars) return true

  // Contexts read directly, like the org above: no provider means no student.
  const child = family?.selectedChild
  const user = auth?.user
  const isStudent = user?.role === 'student' || user?.org_role === 'student'
  const dob = child ? child.dateOfBirth : isStudent ? user?.date_of_birth : null
  const age = ageFromDob(dob)
  return age !== null && age >= DIPLOMA_TRACK_MIN_AGE
}
