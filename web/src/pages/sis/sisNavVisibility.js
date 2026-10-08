import { isSisAdmin, canSeeFinance, canSeeHr } from './sisRole'
import { getPreviewTeacher } from './teacherPreview'
import { isPathHidden } from './sisModules'

/**
 * Who may be OFFERED a console destination.
 *
 * One predicate, two readers: the sidebar (SisSidebar) and the header search
 * (sisSearchIndex). It used to live inline in the sidebar; the search index
 * needs the same answer for the same flags, and two copies of a gate list are
 * how a page ends up offered to a teacher in one place and hidden in the other.
 * The backend is the real gate on every page -- this decides what to show.
 *
 * Flags an item may carry (see NAV_SECTIONS for what each means):
 *   superadmin, adminOnly, teacherOnly, hideInPreview, financeOnly, hrOnly,
 *   and `path`, whose module may be off for the org (sisModules).
 *
 * Whether a page exists for a school is its module and nothing else
 * (docs/sis/SIS_SIMPLIFICATION.md, rule 1). Until 2026-10-08 four items
 * carried a second switch of their own (goalsMode, communityMode,
 * priorLearningMode, clpMode); the first three repeated their module, and
 * CLP's extra setting is now the clp module's own source.
 */

export function navContextFor(user, activeOrg) {
  // While an admin previews a teacher's portal, offer the teacher's console so
  // the preview is faithful (the banner in SisLayout is the way back).
  const previewing = Boolean(getPreviewTeacher())
  return {
    activeOrg,
    previewing,
    isSuperadmin: user?.role === 'superadmin',
    isAdmin: isSisAdmin(user) && !previewing,
    // Campus coordinators run the console but not the money (iCreate,
    // 2026-08-01) and not the HR store (contracts, background checks --
    // iCreate, 2026-08-09).
    seesFinance: canSeeFinance(user) && !previewing,
    seesHr: canSeeHr(user) && !previewing,
  }
}

export function navItemVisible(item, ctx) {
  const { activeOrg, previewing, isSuperadmin, isAdmin, seesFinance, seesHr } = ctx
  if (item.superadmin && !isSuperadmin) return false
  if (item.adminOnly && !isAdmin) return false
  if (item.teacherOnly && isAdmin) return false
  // Pages that can only ever answer for the caller.
  if (item.hideInPreview && previewing) return false
  if (item.financeOnly && !seesFinance) return false
  if (item.hrOnly && !seesHr) return false
  // The item's building-block module is off for this org (explicit
  // feature_flags.modules entry, or its legacy flag) -- one evaluator covers
  // the opt-outs and the opt-ins alike.
  if (item.path && isPathHidden(item.path, activeOrg)) return false
  return true
}
