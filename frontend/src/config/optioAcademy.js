/**
 * Family-first schools — schools that run on the SIS but use almost none of
 * the school-community surfaces, so a parent's whole relationship with the
 * school is their kids. Optio Academy is the original.
 *
 * Blocks P4: this is a per-org flag now — `sis_settings.family_first_home`,
 * carried on the `school` payload (/me and login attach it) and on the
 * school-context org entries. What it changes for a PARENT:
 *
 * - Their home is the family dashboard, not the /dashboard digest (Sidebar +
 *   getPostLoginPath).
 * - The "From <school>" section on /dashboard is hidden, and the school hub
 *   carries only its slimmed card set.
 *
 * The hardcoded org id below is the transition fallback for payloads that
 * predate the flag and for prod until the flag is set on Optio Academy's row
 * (docs/blocks/P4_NOTES.md). Delete it once that write has shipped.
 */
export const OPTIO_ACADEMY_ORG_ID = '8ee22671-6e38-473c-a326-90ff86460310'

/** Legacy fallback: true when this org id is Optio Academy. */
export const isOptioAcademyOrg = (orgId) => !!orgId && orgId === OPTIO_ACADEMY_ORG_ID

/**
 * True when the viewer belongs to a family-first school.
 *
 * Checks BOTH sides because a parent reaches a school two different ways: org
 * members carry organization_id, while a platform parent belongs to the school
 * only through their child (OrganizationContext's `school`, resolved by /me).
 * The flag wins wherever a payload carries it; the org-id check remains as the
 * transition fallback.
 */
export const inOptioAcademy = ({ user, school } = {}) => {
  const s = school || user?.school
  if (s?.family_first_home) return true
  if (user?.organization?.feature_flags?.sis_settings?.family_first_home) return true
  return isOptioAcademyOrg(user?.organization_id) || isOptioAcademyOrg(s?.id)
}

/** The same question asked of a school-context org entry (SchoolPage). */
export const isFamilyFirstHubOrg = (org) =>
  Boolean(org?.family_first_home) || isOptioAcademyOrg(org?.organization_id)
