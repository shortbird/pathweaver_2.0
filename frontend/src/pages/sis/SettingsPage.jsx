import React, { useEffect, useState, useCallback } from 'react'
import api from '../../services/api'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useSisOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import SisOrgSettings from '../../components/sis/SisOrgSettings'
import TimeBlocksCard from '../../components/sis/TimeBlocksCard'
import CalendarCategoriesCard from '../../components/sis/CalendarCategoriesCard'
import KioskDevicesCard from '../../components/sis/KioskDevicesCard'

/**
 * SIS Settings page — org details, branding/logo, AI feature toggles, and School
 * Jobs visibility. Hosts the shared SettingsTab (same controls the legacy org
 * admin page used) but resolves the org through the SIS picker so superadmins can
 * operate across any organization, consistent with every other SIS page.
 */
const SettingsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin, loading: orgLoading } = useSisOrg()
  const { refreshOrganization } = useOrganization()
  const [orgData, setOrgData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchOrg = useCallback(() => {
    if (!orgId) { setOrgData(null); setLoading(false); return }
    setLoading(true)
    api.get(`/api/admin/organizations/${orgId}`)
      .then((r) => setOrgData(r.data))
      .catch(() => setOrgData(null))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { fetchOrg() }, [fetchOrg])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Settings</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      {(loading || orgLoading) ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        </div>
      ) : !orgId ? (
        <p className="text-neutral-500">Select an organization to manage its settings.</p>
      ) : !orgData?.organization ? (
        <p className="text-neutral-500">Organization not found.</p>
      ) : (
        <div className="grid gap-6">
          {/* key remounts the uncontrolled forms when the superadmin switches orgs */}
          <SisOrgSettings
            key={orgId}
            orgId={orgId}
            orgData={orgData}
            onUpdate={fetchOrg}
            onLogoChange={refreshOrganization}
          />
          <TimeBlocksCard key={`blocks-${orgId}`} orgId={orgId} org={orgData.organization} onUpdate={fetchOrg} />
          <CalendarCategoriesCard key={`cats-${orgId}`} orgId={orgId} org={orgData.organization} onUpdate={fetchOrg} />
          <KioskDevicesCard key={`kiosk-${orgId}`} orgId={orgId} />
          {/* Parent-registration config moved to the Registration page (Operations). */}
        </div>
      )}
    </div>
  )
}

export default SettingsPage
