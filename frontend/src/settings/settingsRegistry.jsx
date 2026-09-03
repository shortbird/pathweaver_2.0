import React from 'react'
import SisOrgSettings from '../components/sis/SisOrgSettings'
import ClassroomsCard from '../components/sis/ClassroomsCard'
import TimeBlocksCard from '../components/sis/TimeBlocksCard'
import CalendarCategoriesCard from '../components/sis/CalendarCategoriesCard'
import QuickLinksCard from '../components/sis/QuickLinksCard'
import KioskDevicesCard from '../components/sis/KioskDevicesCard'
import SchoolLoginLinkCard from '../components/organization/SchoolLoginLinkCard'
import HelpVideoCard from './cards/HelpVideoCard'
import PillarsCard from './cards/PillarsCard'
import StepPrintingCard from './cards/StepPrintingCard'
import { moduleEnabled } from '../modules/moduleEnabled'

/**
 * The one settings registry (ARCHITECTURE_BLOCKS section 4.4, blocks P3).
 *
 * Both settings surfaces — the SIS console's Settings page ('console') and the
 * learning app's /organization Settings tab ('learning') — render THIS list,
 * filtered by surface, the org's enabled modules, and the caller's tier.
 * Before it existed the two surfaces were hand-maintained twins that had
 * already diverged (step printing and the program video only on the legacy
 * tab; rooms, blocks and kiosks only on the console; weekly XP goals on one
 * XP card but not the other). A control added here appears on every surface
 * it declares — adding to only one is no longer possible.
 *
 * Every Component receives the same props: { orgId, org, orgData, onUpdate,
 * onLogoChange }. Cards take what they need and ignore the rest.
 *
 * `module`: the card renders only when that building block is on for the org
 * (evaluated with moduleEnabled — server-computed effective_modules first,
 * legacy-flag derivation as the fallback). `minTier: 'finance'` hides the org
 * identity/pricing card from campus coordinators, mirroring the backend's
 * org_finance_flags redaction — chrome only, the backend is the gate.
 */

const LoginLinkCard = ({ org }) => (org?.slug ? <SchoolLoginLinkCard slug={org.slug} /> : null)

export const SETTINGS_CARDS = [
  { key: 'org', minTier: 'finance', surfaces: ['console', 'learning'], Component: SisOrgSettings },
  { key: 'login-link', surfaces: ['console', 'learning'], Component: LoginLinkCard },
  { key: 'rooms', module: 'classes', surfaces: ['console'], Component: ClassroomsCard },
  { key: 'time-blocks', module: 'classes', surfaces: ['console'], Component: TimeBlocksCard },
  { key: 'calendar-categories', module: 'calendar', surfaces: ['console'], Component: CalendarCategoriesCard },
  { key: 'quick-links', surfaces: ['console'], Component: QuickLinksCard },
  { key: 'kiosk', module: 'kiosk', surfaces: ['console'], Component: KioskDevicesCard },
  { key: 'help-video', surfaces: ['console', 'learning'], Component: HelpVideoCard },
  { key: 'pillars', surfaces: ['learning'], Component: PillarsCard },
  { key: 'step-printing', surfaces: ['console', 'learning'], Component: StepPrintingCard },
]

export function settingsCardsFor({ surface, org, seesFinance }) {
  return SETTINGS_CARDS.filter((card) => {
    if (!card.surfaces.includes(surface)) return false
    if (card.module && !(org && moduleEnabled(org, card.module))) return false
    if (card.minTier === 'finance' && !seesFinance) return false
    return true
  })
}

/** The shared renderer: one grid of the surface's cards. */
export function SettingsCards({ surface, orgId, orgData, seesFinance = true, canEditSlug = false, onUpdate, onLogoChange }) {
  const org = orgData?.organization
  return (
    <div className="grid gap-6">
      {settingsCardsFor({ surface, org, seesFinance }).map(({ key, Component }) => (
        <Component
          key={`${key}-${orgId}`}
          orgId={orgId}
          org={org}
          orgData={orgData}
          canEditSlug={canEditSlug}
          onUpdate={onUpdate}
          onLogoChange={onLogoChange}
        />
      ))}
    </div>
  )
}
