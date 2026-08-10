import React, { useEffect, useState, useCallback } from 'react'
import api from '../../services/api'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useSisOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import SisOrgSettings from '../../components/sis/SisOrgSettings'
import TimeBlocksCard from '../../components/sis/TimeBlocksCard'
import CalendarCategoriesCard from '../../components/sis/CalendarCategoriesCard'
import QuickLinksCard from '../../components/sis/QuickLinksCard'
import KioskDevicesCard from '../../components/sis/KioskDevicesCard'
import ICreateRegistrationSettings from '../../components/sis/ICreateRegistrationSettings'
import FirstDayOfSchoolCard from '../../components/sis/FirstDayOfSchoolCard'
import EnrollmentAgeGatesCard from '../../components/sis/EnrollmentAgeGatesCard'

/**
 * SIS Settings page — org details, branding/logo, AI feature toggles, and School
 * Jobs visibility. Renders SisOrgSettings -- the native SIS replacement for the
 * legacy org SettingsTab, NOT that component itself -- and resolves the org
 * through the SIS picker so superadmins can operate across any organization,
 * consistent with every other SIS page.
 *
 * Note for anyone adding an org setting: there are TWO surfaces. SIS orgs land
 * here (SisOrgSettings); non-SIS orgs use the legacy SettingsTab under
 * /admin/organizations/:orgId. A control added to only one is invisible to half
 * the customers.
 *
 * Also hosts the registration CONFIG (Registration & enrollment): the parent
 * funnel (iCreate orgs only), the first day of school, and the waitlisted age
 * groups. The day-to-day enrollment queues stay on the Registration page.
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

  // Deep link (/settings#registration, from the Registration page) — react-router
  // doesn't restore hash targets, and the section only exists once the org has
  // loaded, so scroll after the cards render.
  useEffect(() => {
    if (loading || !window.location.hash) return
    const target = document.getElementById(window.location.hash.slice(1))
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading])

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
          <QuickLinksCard key={`links-${orgId}`} orgId={orgId} org={orgData.organization} onUpdate={fetchOrg} />
          <KioskDevicesCard key={`kiosk-${orgId}`} orgId={orgId} />

          {/* Registration & enrollment — how families register (funnel config,
              first day of school, waitlisted age groups). The enrollment queues
              themselves live on the Registration page. */}
          {/* id: the Registration page links straight here — staff went looking
              for the funnel config on /registration after it moved. */}
          <div className="pt-2 scroll-mt-6" id="registration">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">
              Registration &amp; enrollment
            </h2>
            <div className="grid gap-6">
              {/* Renders null for orgs without the iCreate registration funnel. */}
              <ICreateRegistrationSettings key={`icr-${orgId}`} orgId={orgId} orgData={orgData} onUpdate={fetchOrg} />
              <FirstDayOfSchoolCard key={`year-${orgId}`} orgId={orgId} org={orgData.organization} onUpdate={fetchOrg} />
              <EnrollmentAgeGatesCard key={`gates-${orgId}`} orgId={orgId} org={orgData.organization} onUpdate={fetchOrg} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SettingsPage
