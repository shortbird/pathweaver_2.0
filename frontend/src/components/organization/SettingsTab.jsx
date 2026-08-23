import React from 'react'
import { SettingsCards } from '../../settings/settingsRegistry'

/**
 * The learning app's org Settings tab — the 'learning' surface of the ONE
 * settings registry (settings/settingsRegistry.jsx, blocks P3).
 *
 * This file used to be a 615-line monolith that re-implemented organization
 * details, branding, the AI toggles and the bounty/XP switches in parallel
 * with the SIS console's SisOrgSettings — and the two had already diverged
 * (weekly XP goals only here, materials allowance only there). It is now a
 * thin renderer: the registry decides which cards this surface carries, and
 * SisOrgSettings is the single implementation of the shared controls.
 *
 * Org admins are the only role that reaches this tab (campus coordinators
 * work in the SIS console), so the finance tier is granted outright.
 */
export default function SettingsTab({ orgId, orgData, onUpdate, onLogoChange }) {
  return (
    <SettingsCards
      surface="learning"
      orgId={orgId}
      orgData={orgData}
      seesFinance
      onUpdate={onUpdate}
      onLogoChange={onLogoChange}
    />
  )
}
