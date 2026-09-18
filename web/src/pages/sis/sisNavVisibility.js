import { isSisAdmin, canSeeFinance, canSeeHr } from './sisRole'
import { getPreviewTeacher } from './teacherPreview'
import {
  isPathHidden, isCommunityEnabled, isPriorLearningEnabled, isGoalsEnabled, isClpEnabled,
} from './sisModules'

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
 *   goalsMode, communityMode, priorLearningMode, clpMode,
 *   and `path`, whose module may be off for the org (sisModules).
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
  // Goals-mode orgs (e.g. Gryffin) set direction/subject goals after
  // registration instead of building a schedule; the Goals tab is meaningless
  // for others.
  if (item.goalsMode && !isGoalsEnabled(activeOrg)) return false
  // Community Hub and Prior Learning are opt-in per org.
  if (item.communityMode && !isCommunityEnabled(activeOrg)) return false
  if (item.priorLearningMode && !isPriorLearningEnabled(activeOrg)) return false
  // CLPs are iCreate's workflow; every other school opts in.
  if (item.clpMode && !isClpEnabled(activeOrg)) return false
  return true
}
