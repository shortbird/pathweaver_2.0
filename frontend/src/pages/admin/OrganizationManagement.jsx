import React, { useState, useEffect, Suspense, lazy } from 'react'
import { useParams, useSearchParams, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import api from '../../services/api'
import { SettingsTab, PeopleTab, ContentTab } from '../../components/organization'

const OrgStudentProgress = lazy(() => import('../../components/admin/OrgStudentProgress'))

const TABS = [
  { id: 'settings', label: 'Settings' },
  { id: 'people', label: 'People' },
  { id: 'content', label: 'Content' },
  { id: 'progress', label: 'Progress' }
]

// Map old tab names to new ones for URL compatibility
const TAB_REDIRECTS = {
  'overview': 'settings',
  'users': 'people',
  'connections': 'people',
  'quests': 'content',
  'courses': 'content'
}

export default function OrganizationManagement() {
  const { orgId: urlOrgId } = useParams()
  const { user } = useAuth()
  const { refreshOrganization } = useOrganization()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  const orgId = urlOrgId || user?.organization_id

  const [orgData, setOrgData] = useState(null)
  const [siteSettings, setSiteSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check for tab from navigation state (e.g., returning from student portfolio)
  const tabFromState = location.state?.activeTab
  const tabFromUrl = searchParams.get('tab') || 'settings'

  // Handle redirects from old tab names
  const getResolvedTab = (tab) => {
    if (TAB_REDIRECTS[tab]) {
      return TAB_REDIRECTS[tab]
    }
    // If the tab doesn't exist in TABS, default to settings
    if (!TABS.find(t => t.id === tab)) {
      return 'settings'
    }
    return tab
  }

  const [activeTab, setActiveTab] = useState(getResolvedTab(tabFromState || tabFromUrl))

  useEffect(() => {
    // If we came from navigation state (e.g., returning from student portfolio), use that tab
    if (tabFromState) {
      const resolvedTab = getResolvedTab(tabFromState)
      setSearchParams({ tab: resolvedTab }, { replace: true })
      setActiveTab(resolvedTab)
      return
    }
    const tab = searchParams.get('tab') || 'settings'
    const resolvedTab = getResolvedTab(tab)

    // Redirect old URLs to new tab names
    if (resolvedTab !== tab) {
      setSearchParams({ tab: resolvedTab }, { replace: true })
    }

    if (resolvedTab !== activeTab) {
      setActiveTab(resolvedTab)
    }
  }, [searchParams, tabFromState])

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    setSearchParams({ tab })
  }

  useEffect(() => {
    if (orgId) {
      fetchOrganizationData()
      fetchSiteSettings()
    }
  }, [orgId])

  const fetchOrganizationData = async () => {
    try {
      const { data } = await api.get(`/api/admin/organizations/${orgId}`)
      setOrgData(data)
    } catch (error) {
      console.error('Failed to fetch organization:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSiteSettings = async () => {
    try {
      const { data } = await api.get('/api/settings')
      setSiteSettings(data.settings || data)
    } catch (error) {
      console.error('Failed to fetch site settings:', error)
    }
  }

  if (!orgId) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center text-gray-500">
          <p>You are not assigned to an organization.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        </div>
      </div>
    )
  }

  if (!orgData) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center text-gray-500">
          <p>Organization not found</p>
        </div>
      </div>
    )
  }

  const LoadingSpinner = () => (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
    </div>
  )

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">{orgData.organization.name}</h1>

      <div className="mb-6 border-b">
        <nav className="flex gap-4">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2 ${
                activeTab === tab.id
                  ? 'border-b-2 border-optio-purple font-medium'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'settings' && (
        <SettingsTab
          orgId={orgId}
          orgData={orgData}
          onUpdate={fetchOrganizationData}
          onLogoChange={refreshOrganization}
        />
      )}

      {activeTab === 'people' && (
        <PeopleTab
          orgId={orgId}
          orgSlug={orgData.organization?.slug}
          users={orgData.users}
          onUpdate={fetchOrganizationData}
        />
      )}

      {activeTab === 'content' && (
        <ContentTab
          orgId={orgId}
          orgData={orgData}
          onUpdate={fetchOrganizationData}
          siteSettings={siteSettings}
        />
      )}

      {activeTab === 'progress' && (
        <Suspense fallback={<LoadingSpinner />}>
          <OrgStudentProgress orgId={orgId} />
        </Suspense>
      )}
    </div>
  )
}
