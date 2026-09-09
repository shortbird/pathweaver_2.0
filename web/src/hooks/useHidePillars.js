import { useContext } from 'react'
import { OrganizationContext } from '../contexts/OrganizationContext'

/**
 * Whether the current user's school has switched the five pillars off.
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
  return Boolean(
    org?.organization?.feature_flags?.hide_pillars || org?.school?.hide_pillars
  )
}
