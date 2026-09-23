import {
  CalendarDaysIcon, BookOpenIcon, UsersIcon, CreditCardIcon,
  DocumentTextIcon, CheckCircleIcon, CalendarIcon,
  TableCellsIcon, AcademicCapIcon, TruckIcon, BuildingLibraryIcon,
} from '@heroicons/react/24/outline'
import { isFamilyFirstHubOrg } from '../../config/optioAcademy'

/**
 * The school's surfaces, as a catalog: which doors exist, who each is for,
 * and which building block gates it. /school renders them as cards and the
 * sidebar renders the family ones as nav items (2026-09-15) -- the same list,
 * so a door cannot exist in one place and not the other.
 */

/**
 * The rail cards, and who each is for.
 *
 * `guardianOnly` is the whole safety property of this file. Calendar and
 * Resources are the school's own content and belong to everyone in the
 * school. Directory is `familiesAndStaff`: guardians and staff, not students
 * (82485501, 2026-09-22 -- the owner's answer to "should students have access
 * to the entire family directory?" was no; the backend refuses them too, in
 * sis_parent_service.is_guardian_or_staff). The rest act on a FAMILY — a household's invoices, a child's absence,
 * the forms a guardian is asked to sign — and a student is a member of the
 * school without being a guardian in it. The backend enforces this too
 * (sis_parent_service authorizes those by family relationship); this list only
 * decides what to offer.
 */
// Copy note (iCreate, 2026-08-06): the word "school" is unwelcome here — "iCreate
// is an education center". Card copy stays neutral ("Calendar", "Let us know…");
// where a sentence needs a subject the page uses the org's own name instead.
const SCHOOL_LIFE_CARDS = [
  {
    name: 'Calendar', path: '/school-calendar', Icon: CalendarDaysIcon,
    description: 'Field trips, showcases and closures.', module: 'calendar',
  },
  {
    name: 'Resources', path: '/resources', Icon: BookOpenIcon,
    description: 'Guidebooks, contracts and forms to refer back to.', module: 'resources',
  },
  {
    name: 'Directory', path: '/family-directory', Icon: UsersIcon,
    description: 'Contact details for families who opted in.', module: 'community',
    familiesAndStaff: true,
  },
  // Everyone's card, not guardian-only: students see the board too (it may
  // explain their own ride) — the backend keeps posting adults-only.
  {
    name: 'Carpool', path: '/carpool', Icon: TruckIcon,
    description: 'Offer or find rides with other families.',
  },
]

const FAMILY_CARDS = [
  {
    name: 'Absences', path: '/absences', Icon: CalendarIcon,
    description: 'Let us know when your child will be out.', guardianOnly: true, module: 'attendance',
  },
  {
    name: 'Billing', path: '/family/billing', Icon: CreditCardIcon,
    description: 'Your balance, invoices and receipts.', guardianOnly: true, module: 'billing',
  },
  // One door for the paperwork in both directions: what the school needs
  // signed or completed (the onboarding block) and what the family asks the
  // office for (the forms block). Two doors, "Checklists" and "Requests",
  // until 2026-09-16 -- see pages/FamilyFormsPage for why. Offered while
  // either block is on; the page shows the half that is.
  {
    name: 'Forms', path: '/family/forms', Icon: DocumentTextIcon,
    description: 'Sign what the office sends you, and send requests to the office.',
    guardianOnly: true, modules: ['onboarding', 'forms'],
  },
]

/** The post-registration card, which differs by how the school runs. */
const flowCard = (postRegistrationFlow) => (
  postRegistrationFlow === 'goals'
    ? {
      name: 'Goal Setting', path: '/family/goals', Icon: CheckCircleIcon,
      description: 'Set a direction and per-subject goals for each child.',
      guardianOnly: true, module: 'goals',
    }
    : {
      name: 'Schedule', path: '/schedule-builder', Icon: TableCellsIcon,
      description: 'Build and change your children’s class schedules.',
      guardianOnly: true, module: 'classes',
    }
)

/** Opt-in per org (feature_flags.sis_settings.prior_learning_enabled), so a
 *  school that doesn't take prior-learning submissions never shows the door. */
const priorLearningCard = {
  name: 'Prior Learning', path: '/family/prior-learning', Icon: AcademicCapIcon,
  description: 'Submit learning done before Optio for high-school credit.',
  guardianOnly: true, module: 'prior_learning',
}

// Who counts as staff for a `familiesAndStaff` card. Mirrors
// backend/utils/sis_roles.STAFF_ROLES, which is what the directory endpoint
// admits beside guardians.
const STAFF_ROLES = ['org_admin', 'campus_coordinator', 'advisor', 'superadmin']

/** May this viewer have this card? Only `familiesAndStaff` cards depend on
 *  the viewer; the rest are decided by the org alone. `viewerRole` is the
 *  effective role (or the role a superadmin is previewing as). Left out, the
 *  card is withheld from a non-guardian: a door that 403s is worse than none. */
const viewerMayHave = (card, org, viewerRole) =>
  !card.familiesAndStaff || org.is_guardian || STAFF_ROLES.includes(viewerRole)

/** The rail, grouped. A student gets only the School life group, without the
 *  Directory. */
export function cardGroupsFor(org, { viewerRole } = {}) {
  if (!org) return []
  // A family-first school (sis_settings.family_first_home — Optio Academy is
  // the original) runs almost none of the school-community surfaces, so the
  // full card set was a row of doors onto empty rooms — which is why its
  // parents had this page taken out of the nav entirely. It's back for Prior
  // Learning, and that is ALL it carries for such a school.
  if (isFamilyFirstHubOrg(org)) {
    return org.is_guardian && org.prior_learning_enabled
      ? [{ id: 'family', title: 'My family', cards: [priorLearningCard] }]
      : []
  }
  const family = [flowCard(org.post_registration_flow), ...FAMILY_CARDS]
  if (org.prior_learning_enabled) family.push(priorLearningCard)
  const groups = []
  if (org.is_guardian) groups.push({ id: 'family', title: 'My family', cards: family })
  groups.push({
    id: 'school-life', title: 'School life',
    cards: SCHOOL_LIFE_CARDS.filter((c) => viewerMayHave(c, org, viewerRole)),
  })
  // Blocks P3: the server names which family-surface modules this school runs
  // (school_context orgs[].modules); a card whose module is off disappears, and
  // a group left with no cards goes with it. An older payload without the list,
  // or a card the registry has no key for (Carpool), keeps showing.
  if (!Array.isArray(org.modules)) return groups
  // `module` names the one block a card needs; `modules` names several, of
  // which any one is enough (the Forms door serves two blocks).
  const wanted = (c) => c.modules || (c.module ? [c.module] : [])
  return groups
    .map((g) => ({ ...g, cards: g.cards.filter((c) => !wanted(c).length || wanted(c).some((m) => org.modules.includes(m))) }))
    .filter((g) => g.cards.length > 0)
}

/** Flat list — kept for callers that only care about which doors exist. */
export function cardsFor(org, options) {
  return cardGroupsFor(org, options).flatMap((g) => g.cards)
}


/**
 * The school's tabs for a GUARDIAN (pages/school/SchoolShell): the family doors, plus
 * the calendar, plus the school's own page when the org front-doors families
 * through it. Everything else on /school (resources, directory, carpool)
 * stays a card there; a sidebar that lists every door is a sidebar nobody
 * reads. Empty for a member who is not a guardian, and for anyone whose
 * school has no family surfaces on.
 *
 * Until 2026-09-15 none of these pages was in the sidebar at all: a parent
 * reached Billing from the /school card grid, from the attention strip on
 * /family, or from a notification link, and not otherwise. iCreate's parent
 * training is where "where do I pay" gets asked.
 */
export function familyNavItemsFor(org, { homepage = false } = {}) {
  if (!org?.is_guardian) return []
  const groups = cardGroupsFor(org)
  const family = groups.find((g) => g.id === 'family')?.cards || []
  const calendar = (groups.find((g) => g.id === 'school-life')?.cards || [])
    .filter((c) => c.path === '/school-calendar')
  const items = []
  if (homepage) {
    // Named after the school, like the Community item a non-guardian gets:
    // "Announcements" named the page's feed, not the place (2026-09-16).
    items.push({ name: org.organization_name || 'My school', tab: 'Feed', path: '/school', Icon: BuildingLibraryIcon })
  }
  for (const card of [...calendar, ...family]) {
    items.push({ name: card.name, path: card.path, Icon: card.Icon })
  }
  return items
}
