/**
 * Program registry (frontend).
 *
 * The single place where core learns which member organizations have a custom
 * in-app program surface. Core (Sidebar, router, dashboards) consumes this
 * registry; it must never hardcode a program slug. Adding a program = add an
 * entry here, touching zero core files.
 *
 * Part of the "core is the base, programs are extensions" architecture (see
 * docs/ARCHITECTURE_CORE_AND_PROGRAMS.md). It carries the sidebar program-tab
 * config, the diploma widget/data hooks, and the program page routes; program
 * pages live co-located under src/programs/<program>/.
 */
import React, { lazy } from 'react'
import { Route } from 'react-router-dom'
import { renderOeaDiploma, fetchOeaDiploma } from './oea/DiplomaWidget'
import { useTreehouseQuestView } from './treehouse/questView'

// Diploma/academy cap — shared by the diploma-style programs (OEA, Hearthwood, Gryffin).
const capIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14v7" />
  </svg>
)

const treehouseIcon = (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l4 5h-3v3h2l4 6H7l4-6h2V8h-3l2-5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17v4" />
  </svg>
)

/**
 * Programs keyed by the member organization's slug. Each declares its sidebar
 * tab. `navVisibleToOrgAdmin` replaces the former hardcoded `slug === 'treehouse'`
 * special-case: programs whose in-app page serves staff too (Treehouse's
 * facilitator view) set it true; diploma programs managed from /organization
 * leave it false so the tab is hidden from org admins.
 */
export const PROGRAMS = {
  oea: {
    slug: 'oea',
    name: 'OpenEd Academy',
    navPath: '/opened-academy',
    navIcon: capIcon,
    navVisibleToOrgAdmin: false,
  },
  'hearthwood-test': {
    slug: 'hearthwood-test',
    name: 'Hearthwood Academy',
    navPath: '/opened-academy',
    navIcon: capIcon,
    navVisibleToOrgAdmin: false,
  },
  treehouse: {
    slug: 'treehouse',
    name: 'The Treehouse',
    navPath: '/treehouse',
    navIcon: treehouseIcon,
    navVisibleToOrgAdmin: true,
  },
  gryffin: {
    slug: 'gryffin',
    name: 'Gryffin Learning Center',
    navPath: '/gryffin',
    navIcon: capIcon,
    navVisibleToOrgAdmin: false,
  },
}

/** Program config for an org slug, or null if the org has no custom program. */
export function getProgramForSlug(slug) {
  return (slug && PROGRAMS[slug]) || null
}

/**
 * Build the sidebar nav item for an org's program, honoring role visibility and
 * an optional org-uploaded logo override. Returns null when no tab should show.
 */
export function getProgramNavItem({ slug, effectiveRole, orgLogoUrl }) {
  const program = getProgramForSlug(slug)
  if (!program) return null
  if (!program.navVisibleToOrgAdmin && effectiveRole === 'org_admin') return null
  return {
    name: program.name,
    path: program.navPath,
    icon: orgLogoUrl
      ? <img src={orgLogoUrl} alt="" className="w-5 h-5 object-contain rounded" />
      : program.navIcon,
  }
}


// ── Diploma widget hook ──────────────────────────────────────────────────────
// Programs that own a student's diploma (e.g. OEA) plug a renderer in here. Each
// takes the overview diploma context and returns a rendered panel, or null if it
// does not apply. Core (SkillsGrowth) renders the first non-null, else its own
// Optio-credits default — so core carries no program-specific diploma rendering.
const DIPLOMA_WIDGETS = [renderOeaDiploma]

/** The program diploma panel for this context, or null (core renders its default). */
export function renderDiplomaWidget(context) {
  for (const widget of DIPLOMA_WIDGETS) {
    const el = widget(context)
    if (el) return el
  }
  return null
}

// The program that owns a student's diploma supplies its data here (symmetric
// with the render hook above), so core overview hooks don't import a program API.
export function fetchProgramDiploma(studentId) {
  return fetchOeaDiploma(studentId)
}


// ── Quest-view widget hook ───────────────────────────────────────────────────
// Programs contribute quest-page UI + behavior for core QuestDetail. Hooks
// compose, so each program's quest-view hook is called unconditionally (one
// program today; merge results here when a second is added).
export function useProgramQuestView(quest) {
  return useTreehouseQuestView(quest)
}


// ── Program page routes ──────────────────────────────────────────────────────
// Each program's pages, declared per mount context so core App.jsx renders them
// without naming any program:
//   'app'        — inside the protected app Layout
//   'public'     — public / marketing pages (Layout, no auth)
//   'standalone' — top-level, no app Layout (e.g. the Treehouse kiosk)
const OpenEdAcademyPage = lazy(() => import('./oea/OpenEdAcademyPage'))
const OEASelectPathwayPage = lazy(() => import('./oea/OEASelectPathwayPage'))
const OEACreditsPage = lazy(() => import('./oea/OEACreditsPage'))
const OEATranscriptPage = lazy(() => import('./oea/OEATranscriptPage'))
const OEAProgressReportPage = lazy(() => import('./oea/OEAProgressReportPage'))
const TreehousePage = lazy(() => import('./treehouse/TreehousePage'))
const TreehouseBrowsePage = lazy(() => import('./treehouse/TreehouseBrowsePage'))
const TreehouseShowcasePage = lazy(() => import('./treehouse/TreehouseShowcasePage'))
const TreehouseFacilitatorPage = lazy(() => import('./treehouse/TreehouseFacilitatorPage'))
const TreehouseKioskPage = lazy(() => import('./treehouse/TreehouseKioskPage'))
const GryffinPage = lazy(() => import('./gryffin/GryffinPage'))
const PoePage = lazy(() => import('./poe/PoePage'))

const PROGRAM_ROUTES = {
  app: [
    { path: 'opened-academy', element: <OpenEdAcademyPage /> },
    { path: 'opened-academy/student/:studentId/pathway', element: <OEASelectPathwayPage /> },
    { path: 'opened-academy/student/:studentId/credits', element: <OEACreditsPage /> },
    { path: 'opened-academy/student/:studentId/transcript', element: <OEATranscriptPage /> },
    { path: 'opened-academy/student/:studentId/progress-report', element: <OEAProgressReportPage /> },
    { path: 'treehouse', element: <TreehousePage /> },
    { path: 'treehouse/browse', element: <TreehouseBrowsePage /> },
    { path: 'treehouse/showcase', element: <TreehouseShowcasePage /> },
    { path: 'treehouse/facilitator', element: <TreehouseFacilitatorPage /> },
    { path: 'gryffin', element: <GryffinPage /> },
    { path: 'gryffin/:classId', element: <GryffinPage /> },
  ],
  public: [
    { path: 'poe', element: <PoePage /> },
  ],
  standalone: [
    { path: 'treehouse-kiosk', element: <TreehouseKioskPage /> },
  ],
}

/** <Route> elements for a given mount context (core App.jsx splices these in). */
export function getProgramRoutes(context) {
  return (PROGRAM_ROUTES[context] || []).map((r) => (
    <Route key={r.path} path={r.path} element={r.element} />
  ))
}
