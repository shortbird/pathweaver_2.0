import React, { useState, useEffect } from 'react'
import { useParams, useSearchParams, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { isSimplifiedPartnerOrg } from '../../config/partnerOrgs'
import { useOrganization } from '../../contexts/OrganizationContext'
import api from '../../services/api'
import { SettingsTab, PeopleTab } from '../../components/organization'
import OrgCoursesTab from '../../components/organization/OrgCoursesTab'
import OrgClassesTab from '../../components/organization/OrgClassesTab'
import AnnouncementsTab from '../../components/organization/AnnouncementsTab'
import CreditReviewDashboardPage from '../CreditReviewDashboardPage'
import BountyBoardPage from '../BountyBoardPage'

const TABS = [
  { id: 'settings', label: 'Settings' },
  { id: 'people', label: 'People' },
  { id: 'classes', label: 'Classes' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'courses', label: 'Courses' },
  { id: 'bounties', label: 'Bounties' },
  { id: 'credit-review', label: 'Credit Review' }
]

// One-line guidance shown under the tab bar so org admins know what each tab is
// for. Keyed by tab id.
const TAB_DESCRIPTIONS = {
  settings: "Manage your organization's name, branding, and account settings.",
  people: 'Add and manage your students, parents, and advisors. Invite new members and set their roles.',
  classes: 'Group students into classes, assign quests, and schedule when each quest becomes available to the class.',
  announcements: 'Send a notification through Optio to everyone in your organization — students, advisors, and parents.',
  courses: 'Assign courses to your students and build new course content for your organization.',
  bounties: 'View the bounties available to your students and post new ones to encourage their learning.',
  'credit-review': "Review your students' completed work and approve the credit they've earned.",
}

// Map old tab names to new ones for URL compatibility. getResolvedTab falls back
// to 'settings' for any id not in TABS, so old bookmarks land somewhere valid.
// ('classes' is a live tab again as of 2026-06-15 — class management + quest scheduling.)
const TAB_REDIRECTS = {
  'overview': 'settings',
  'users': 'people',
  'connections': 'people',
  'quests': 'courses',
  'advisors': 'people',
  'progress': 'settings'
}

export default function OrganizationManagement() {
  const { orgId: urlOrgId } = useParams()
  const { user } = useAuth()
  const { refreshOrganization } = useOrganization()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()

  const orgId = urlOrgId || user?.organization_id

  // Simplified-partner org admins (e.g. OnFire Learning) use the focused /onfire
  // dashboard, not the full org-management UI. Superadmins still see it normally.
  const redirectToPartnerDashboard =
    user?.org_role === 'org_admin' && isSimplifiedPartnerOrg(user?.organization_id)

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

  if (redirectToPartnerDashboard) {
    return <Navigate to="/onfire" replace />
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

      {TAB_DESCRIPTIONS[activeTab] && (
        <p className="text-sm text-gray-500 mb-6 -mt-2">
          {TAB_DESCRIPTIONS[activeTab]}
        </p>
      )}

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

      {activeTab === 'classes' && (
        <OrgClassesTab orgId={orgId} />
      )}

      {activeTab === 'announcements' && (
        <AnnouncementsTab orgId={orgId} />
      )}

      {activeTab === 'courses' && (
        <OrgCoursesTab orgId={orgId} orgData={orgData} />
      )}

      {activeTab === 'bounties' && (
        <BountyBoardPage />
      )}

      {activeTab === 'credit-review' && (
        <CreditReviewDashboardPage />
      )}

    </div>
  )
}
