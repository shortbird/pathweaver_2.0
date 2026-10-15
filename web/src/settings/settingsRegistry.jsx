import React from 'react'
import SisOrgSettings from '../components/sis/SisOrgSettings'
import ClassroomsCard from '../components/sis/ClassroomsCard'
import TimeBlocksCard from '../components/sis/TimeBlocksCard'
import CalendarCategoriesCard from '../components/sis/CalendarCategoriesCard'
import QuickLinksCard from '../components/sis/QuickLinksCard'
import KioskDevicesCard from '../components/sis/KioskDevicesCard'
import SchoolLoginLinkCard from '../components/organization/SchoolLoginLinkCard'
import ParentDigestCard from './cards/ParentDigestCard'
import PillarsCard from './cards/PillarsCard'
import StepPrintingCard from './cards/StepPrintingCard'
import IncidentReportsCard from './cards/IncidentReportsCard'
import FamilyContactsCard from './cards/FamilyContactsCard'
import FriendsCard from './cards/FriendsCard'
import StudentChatCard from './cards/StudentChatCard'
import FeaturesCard from './cards/FeaturesCard'
import TaskXpFloorCard from './cards/TaskXpFloorCard'
import AttendanceSettingsCard from './cards/AttendanceSettingsCard'
import BloomyInboxCard from './cards/BloomyInboxCard'
import { moduleEnabled } from '../modules/moduleEnabled'

/**
 * The one settings registry (ARCHITECTURE_BLOCKS section 4.4, blocks P3).
 *
 * The SIS console's Settings page ('console') renders THIS list, filtered by
 * surface, the org's enabled modules, and the caller's tier. It was built to
 * end two hand-maintained twins that had already diverged (step printing and
 * the program video only on the legacy tab; rooms, blocks and kiosks only on
 * the console). The second surface, the learning app's /organization Settings
 * tab ('learning'), was removed on 2026-10-15 when every org became an SIS
 * org; its cards were all console cards by then (pillars was the last to
 * move). `surfaces` stays so a card can name where it renders if a second
 * surface ever returns.
 *
 * Every Component receives the same props: { orgId, org, orgData, onUpdate,
 * onLogoChange }. Cards take what they need and ignore the rest.
 *
 * `module`: the card renders only when that building block is on for the org
 * (evaluated with moduleEnabled — server-computed effective_modules first,
 * legacy-flag derivation as the fallback); `modules` is a list of which any
 * one suffices. `minTier: 'finance'` hides the org
 * identity/pricing card from campus coordinators, mirroring the backend's
 * org_finance_flags redaction — chrome only, the backend is the gate.
 */

const LoginLinkCard = ({ org }) => (org?.slug ? <SchoolLoginLinkCard slug={org.slug} /> : null)

export const SETTINGS_CARDS = [
  { key: 'org', minTier: 'finance', surfaces: ['console'], Component: SisOrgSettings },
  { key: 'login-link', surfaces: ['console'], Component: LoginLinkCard },
  // The school's own feature switches (MICROSCHOOL_FIRST_PLAN part 3). No
  // `module` gate: the card is how a school turns its features on. Console
  // only, since nearly every feature on it lives in the console. Org admins
  // only; the card renders nothing for anyone the API refuses.
  { key: 'features', surfaces: ['console'], Component: FeaturesCard },
  { key: 'rooms', module: 'classes', surfaces: ['console'], Component: ClassroomsCard },
  { key: 'time-blocks', module: 'classes', surfaces: ['console'], Component: TimeBlocksCard },
  { key: 'calendar-categories', module: 'calendar', surfaces: ['console'], Component: CalendarCategoriesCard },
  { key: 'quick-links', surfaces: ['console'], Component: QuickLinksCard },
  // Who to contact (ticket c58b7c0b): the "for this, ask that person" list
  // families see on their home. Console only: the office keeps it, and only
  // an SIS school has the staff and families it names.
  { key: 'family-contacts', surfaces: ['console'], Component: FamilyContactsCard },
  // Who gets a staff member's incident report by default (ticket a26d9daf).
  // Console only: filing and working the reports both happen in the SIS.
  // `modules` (any of): a report lands as a task, and /api/sis/incident-reports
  // answers when tasks OR onboarding is on (routes/sis/tasks.py TASK_MODULES).
  { key: 'incident-reports', modules: ['tasks', 'onboarding'], surfaces: ['console'], Component: IncidentReportsCard },
  // Console only, deliberately (owner's call, 2026-09-08): the weekly digest
  // reports on class work with due dates, which is a school's business, and the
  // people who decide whether a school emails its families sit in the SIS.
  { key: 'parent-digest', module: 'classes', surfaces: ['console'], Component: ParentDigestCard },
  // The kiosk block has no SIS parent: any school provisions its classroom
  // devices here, whatever else it has on.
  { key: 'kiosk', module: 'kiosk', surfaces: ['console'], Component: KioskDevicesCard },
  { key: 'pillars', surfaces: ['console'], Component: PillarsCard },
  { key: 'step-printing', surfaces: ['console'], Component: StepPrintingCard },
  // The school's Friends default for students with no parent linked. Until
  // 2026-09-30 no school had a screen for it.
  { key: 'friends', module: 'friends', surfaces: ['console'], Component: FriendsCard },
  // The school's Student Chat switch (ticket 81cc92e6, Horizon). No `module`
  // gate on purpose: the card is how a school turns the module back on. Org
  // admins only; the card renders nothing for anyone the API refuses.
  { key: 'student-chat', surfaces: ['console'], Component: StudentChatCard },
  // The smallest XP one of the school's own tasks may be worth (ticket
  // a6f7b429). Every school authors quests.
  { key: 'task-xp-floor', surfaces: ['console'], Component: TaskXpFloorCard },
  // How the school takes attendance: the whole-school daily roll, pickup
  // check-out, which statuses, which weekdays (ticket 0680d03c). Console
  // only: every attendance screen is in the SIS.
  { key: 'attendance', module: 'attendance', surfaces: ['console'], Component: AttendanceSettingsCard },
  // Leave work Bloomy already verified out of the Submissions inbox (ticket
  // bc68a12e, Apogee Cache Valley). Console only, where the inbox is; only
  // where Bloomy is on, since the switch means nothing anywhere else.
  { key: 'bloomy-inbox', module: 'bloomy', surfaces: ['console'], Component: BloomyInboxCard },
]

export function settingsCardsFor({ surface, org, seesFinance }) {
  return SETTINGS_CARDS.filter((card) => {
    if (!card.surfaces.includes(surface)) return false
    if (card.module && !(org && moduleEnabled(org, card.module))) return false
    if (card.modules && !(org && card.modules.some((m) => moduleEnabled(org, m)))) return false
    if (card.minTier === 'finance' && !seesFinance) return false
    return true
  })
}

/**
 * The shared renderer: one grid of the surface's cards. Each card sits in a
 * wrapper anchored by its key (#settings-rooms), which is how the console's
 * header search lands on one card (pages/sis/sisSearchIndex.js); scroll-mt
 * keeps the card's title out from under the sticky header.
 */
export function SettingsCards({ surface, orgId, orgData, seesFinance = true, canEditSlug = false, canEditAccreditation = false, onUpdate, onLogoChange }) {
  const org = orgData?.organization
  return (
    <div className="grid gap-6">
      {settingsCardsFor({ surface, org, seesFinance }).map(({ key, Component }) => (
        <div key={`${key}-${orgId}`} id={`settings-${key}`} className="scroll-mt-20">
          <Component
            orgId={orgId}
            org={org}
            orgData={orgData}
            canEditSlug={canEditSlug}
            canEditAccreditation={canEditAccreditation}
            onUpdate={onUpdate}
            onLogoChange={onLogoChange}
          />
        </div>
      ))}
    </div>
  )
}
