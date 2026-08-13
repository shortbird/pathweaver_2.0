/**
 * Optio Academy — Optio's own school, which runs on the SIS but uses almost
 * none of the school-community surfaces the member orgs do.
 *
 * Its sis_settings.hidden_modules already turns off calendar, resources,
 * classes, attendance and the rest on the console side. This module is the
 * learning-app half of the same fact, for the two places where "which school"
 * changes what a PARENT sees:
 *
 * - Their home is the family dashboard, not the /dashboard digest. An Academy
 *   parent's whole relationship with the school is their kids, so the Family
 *   tab IS home (Sidebar + getPostLoginPath).
 * - The "From <school>" section on /dashboard is hidden. Every card in it —
 *   Calendar, Resources, Directory — points at a module this school does not
 *   run, so the section was a row of doors onto empty rooms.
 *
 * Deliberately an id list rather than a feature flag: this is one school, not
 * a capability other orgs would opt into. If a second school ever wants the
 * same shape, promote it to feature_flags then.
 */
export const OPTIO_ACADEMY_ORG_ID = '8ee22671-6e38-473c-a326-90ff86460310'

/** True when this org id is Optio Academy. */
export const isOptioAcademyOrg = (orgId) => !!orgId && orgId === OPTIO_ACADEMY_ORG_ID

/**
 * True when the viewer belongs to Optio Academy.
 *
 * Checks BOTH sides because a parent reaches a school two different ways: org
 * members carry organization_id, while a platform parent belongs to the school
 * only through their child (OrganizationContext's `school`, resolved by /me).
 */
export const inOptioAcademy = ({ user, school } = {}) => (
  isOptioAcademyOrg(user?.organization_id) || isOptioAcademyOrg(school?.id)
)
