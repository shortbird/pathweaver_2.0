import React, { useState, useEffect, Suspense, lazy } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useOrganization } from '../../contexts/OrganizationContext'
import api from '../../services/api'
import { OverviewTab, UsersTab, QuestsTab, CourseTab, ConnectionsTab } from '../../components/organization'

const OrgStudentProgress = lazy(() => import('../../components/admin/OrgStudentProgress'))

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'connections', label: 'Connections' },
  { id: 'quests', label: 'Quests' },
  { id: 'courses', label: 'Courses' },
  { id: 'progress', label: 'Progress' }
]

export default function OrganizationManagement() {
  const { orgId: urlOrgId } = useParams()
  const { user } = useAuth()
  const { refreshOrganization } = useOrganization()
  const [searchParams, setSearchParams] = useSearchParams()

  const orgId = urlOrgId || user?.organization_id

  const [orgData, setOrgData] = useState(null)
  const [siteSettings, setSiteSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  const tabFromUrl = searchParams.get('tab') || 'overview'
  const [activeTab, setActiveTab] = useState(tabFromUrl)

  useEffect(() => {
    const tab = searchParams.get('tab') || 'overview'
    if (tab !== activeTab) {
      setActiveTab(tab)
    }
  }, [searchParams])

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

      {activeTab === 'overview' && (
        <OverviewTab
          orgId={orgId}
          orgData={orgData}
          onUpdate={fetchOrganizationData}
          onLogoChange={refreshOrganization}
        />
      )}

      {activeTab === 'users' && (
        <UsersTab
          orgId={orgId}
          orgSlug={orgData.organization?.slug}
          users={orgData.users}
          onUpdate={fetchOrganizationData}
        />
      )}

      {activeTab === 'connections' && (
        <ConnectionsTab orgId={orgId} />
      )}

      {activeTab === 'quests' && (
        <QuestsTab
          orgId={orgId}
          orgData={orgData}
          onUpdate={fetchOrganizationData}
          siteSettings={siteSettings}
        />
      )}

      {activeTab === 'courses' && (
        <CourseTab
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
