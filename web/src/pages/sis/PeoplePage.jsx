import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSisOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import RosterPage from './RosterPage'
import StaffPage from './StaffPage'
import HouseholdsPage from './HouseholdsPage'

/**
 * People — one admin home for everyone in the org, three lenses on the same
 * roster: Everyone (all roles), Staff (HR + teacher-portal preview), and
 * Families (household grouping). Consolidates what used to be three sidebar
 * entries; each lens is the existing page rendered in `embedded` mode (its own
 * heading + org picker suppressed, the shell provides one of each).
 *
 * The active lens lives in the `?tab=` query param so tabs are linkable and the
 * old /users, /staff, /households routes can redirect straight to a lens.
 */
const TABS = [
  { key: 'everyone', label: 'Everyone', Component: RosterPage },
  { key: 'staff', label: 'Staff', Component: StaffPage },
  { key: 'families', label: 'Families', Component: HouseholdsPage },
]

const PeoplePage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [params, setParams] = useSearchParams()
  // The active lens fills this slot (on the tab row) with its own action buttons
  // (Export / + New User / Add teacher) via a portal, so they share the tab row
  // instead of stacking below it.
  const [toolbar, setToolbar] = useState(null)
  const active = TABS.find((t) => t.key === params.get('tab')) || TABS[0]
  const ActiveComponent = active.Component

  const selectTab = (key) => {
    const next = new URLSearchParams(params)
    if (key === TABS[0].key) next.delete('tab')
    else next.set('tab', key)
    setParams(next, { replace: true })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">People</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {TABS.map((t) => {
            const isActive = t.key === active.key
            return (
              <button
                key={t.key}
                onClick={() => selectTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium font-poppins -mb-px border-b-2 transition-colors ${
                  isActive
                    ? 'border-optio-purple text-optio-purple'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        <div ref={setToolbar} className="flex items-center gap-3 pb-2" />
      </div>

      {/* Remount per lens so each page's data load + local state reset cleanly. */}
      <ActiveComponent key={active.key} embedded toolbarEl={toolbar} />
    </div>
  )
}

export default PeoplePage
