import {
  CalendarDaysIcon, BookOpenIcon, UsersIcon, CreditCardIcon,
  DocumentTextIcon, CheckCircleIcon, CalendarIcon,
  TableCellsIcon, AcademicCapIcon, TruckIcon, BuildingLibraryIcon, ClipboardDocumentListIcon,
  StarIcon,
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
 * the tasks a guardian is asked to do — and a student is a member of the
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
  // Everyone's card: a student reads their own week, a guardian each child's
  // (the backend answers /mine by who is asking). Apogee Cache Valley.
  {
    name: 'Weekly Goals', path: '/weekly-goals', Icon: CheckCircleIcon,
    description: "This week's goals, what got done, and freedom.", module: 'weekly_goals',
    // Opt-in: shown only when the server lists the module. An older payload
    // without the list keeps its legacy doors, and this was never one of them.
    optIn: true,
  },
  // Everyone's card: a student reads their own points, a guardian each
  // child's (the backend answers /mine by who is asking). Apogee Cache Valley.
  {
    name: 'Points', path: '/points', Icon: StarIcon,
    description: 'Points from school jobs, and what they were spent on.', module: 'points',
    optIn: true,
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
  // What the school is waiting on the family for. It was "Forms" (and before
  // that "Checklists" and "Requests") until 2026-09-24, when requests and
  // forms were retired: a family messages the school now, and this is their
  // to-do list -- see pages/FamilyFormsPage. The path stays for the links
  // already sent.
  {
    name: 'To do', path: '/family/forms', Icon: DocumentTextIcon,
    description: 'What the office needs from you: things to sign, send in or finish.',
    guardianOnly: true, modules: ['tasks', 'onboarding'],
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

/** Optio Academy's diploma page: each subject, the courses in it, and where a
 *  family adds its own curriculum and sends semester check-ins
 *  (pages/CoursesAndCreditsPage). On the school page, not a child's card:
 *  Tanner, 2026-09-28. */
const coursesAndCreditsCard = {
  name: 'Courses and Credits', path: '/courses-and-credits', Icon: ClipboardDocumentListIcon,
  description: 'Add courses, including your own curriculum, and send semester check-ins for credit.',
  guardianOnly: true,
}

/** Only where the diploma is Optio Academy's (the prior_learning module's
 *  optio_diploma gate, 2026-10-07): Optio Academy and its extension schools. */
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
  // parents had this page taken out of the nav entirely. It came back for
  // Courses and Credits, plus Prior Learning. Prior Learning was folded into
  // Courses and Credits on 2026-09-28 and came back as its own card on
  // 2026-10-07, so every school's families find the upload in the same place;
  // at a family-first school its address still lands on that section.
  if (isFamilyFirstHubOrg(org)) {
    if (!org.is_guardian) return []
    const cards = [coursesAndCreditsCard]
    if (org.prior_learning_enabled) cards.push(priorLearningCard)
    return [{ id: 'family', title: 'My family', cards }]
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
  if (!Array.isArray(org.modules)) {
    return groups
      .map((g) => ({ ...g, cards: g.cards.filter((c) => !c.optIn) }))
      .filter((g) => g.cards.length > 0)
  }
  // `module` names the one block a card needs; `modules` names several, of
  // which any one is enough (the To do door serves two blocks).
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
    .filter((c) => ['/school-calendar', '/weekly-goals', '/points'].includes(c.path))
  const items = []
  // No Feed at a family-first school (2026-09-28): Optio Academy had never
  // posted to it, so the first tab a parent landed on was an empty page.
  if (homepage && !isFamilyFirstHubOrg(org)) {
    // Named after the school, like the Community item a non-guardian gets:
    // "Announcements" named the page's feed, not the place (2026-09-16).
    items.push({ name: org.organization_name || 'My school', tab: 'Feed', path: '/school', Icon: BuildingLibraryIcon })
  }
  for (const card of [...calendar, ...family]) {
    items.push({ name: card.name, path: card.path, Icon: card.Icon })
  }
  return items
}
