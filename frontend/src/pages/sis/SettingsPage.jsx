import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { useOrganization } from '../../contexts/OrganizationContext'
import { useSisOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { AuthContext } from '../../contexts/AuthContext'
import { canSeeFinance } from './sisRole'
import { SettingsCards } from '../../settings/settingsRegistry'

/**
 * SIS Settings page — the console surface of the ONE settings registry
 * (settings/settingsRegistry.jsx, blocks P3). Cards render when their module
 * is on for the org and the caller's tier allows them; the same registry
 * drives the learning app's /organization Settings tab, so a control added
 * there appears here (and vice versa) without a second implementation.
 * Resolves the org through the SIS picker so superadmins can operate across
 * any organization, consistent with every other SIS page.
 *
 * Registration config lives on the Registration page (the editable funnel),
 * NOT here — it was moved twice and staff kept looking for it on /registration,
 * so that is where it stays. The old /settings#registration deep link redirects.
 */
const SettingsPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin, loading: orgLoading } = useSisOrg()
  // Read the context directly rather than through useAuth(): this page is
  // rendered bare in tests, and a missing provider must degrade, not throw.
  const user = React.useContext(AuthContext)?.user
  // The organization card is the org's identity, its AI entitlements and its
  // prices — an org admin's, not the front office's. A campus coordinator gets
  // the rest of this page: rooms, blocks, calendar categories, quick links,
  // kiosks. The backend agrees (utils/org_finance_flags.py); this only decides
  // whether to render a card that would come back empty and save nothing.
  const seesOrgCard = canSeeFinance(user)
  const { refreshOrganization } = useOrganization()
  const [orgData, setOrgData] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchOrg = useCallback((options = {}) => {
    const showSpinner = options?.showSpinner ?? false
    if (!orgId) { setOrgData(null); setLoading(false); return }
    if (showSpinner) setLoading(true)
    api.get(`/api/admin/organizations/${orgId}`)
      .then((r) => setOrgData(r.data))
      .catch(() => setOrgData(null))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => {
    setOrgData(null)
    fetchOrg({ showSpinner: true })
  }, [orgId, fetchOrg])

  // The registration section moved to the Registration page — send old
  // bookmarks and in-app links (/settings#registration) there.
  const navigate = useNavigate()
  useEffect(() => {
    if (window.location.hash === '#registration') navigate('/registration', { replace: true })
  }, [navigate])

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
        /* per-card keys include orgId, remounting the uncontrolled forms when
           the superadmin switches orgs */
        <SettingsCards
          surface="console"
          orgId={orgId}
          orgData={orgData}
          seesFinance={seesOrgCard}
          onUpdate={fetchOrg}
          onLogoChange={refreshOrganization}
        />
      )}
    </div>
  )
}

export default SettingsPage
