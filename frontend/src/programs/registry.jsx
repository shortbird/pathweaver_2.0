/**
 * Program registry (frontend).
 *
 * The single place where core learns which member organizations have a custom
 * in-app program surface. Core (Sidebar, router, dashboards) consumes this
 * registry; it must never hardcode a program slug. Adding a program = add an
 * entry here, touching zero core files.
 *
 * This is the first piece of the "core is the base, programs are extensions"
 * architecture (see docs/ARCHITECTURE_CORE_AND_PROGRAMS.md). Today it carries
 * the sidebar program-tab config; it can grow to hold routes, dashboard
 * widgets, and theming per program.
 */
import React from 'react'

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
