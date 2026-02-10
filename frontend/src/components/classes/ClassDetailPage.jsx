import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  UsersIcon,
  BookOpenIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'
import { useAuth } from '../../contexts/AuthContext'
import ClassSettingsTab from './ClassSettingsTab'
import ClassStudentsTab from './ClassStudentsTab'
import ClassQuestsTab from './ClassQuestsTab'
import ClassAdvisorsTab from './ClassAdvisorsTab'

/**
 * ClassDetailPage - Full class view with tabs
 *
 * Tabs:
 * - Students: View enrolled students with progress
 * - Quests: Manage quests assigned to the class
 * - Advisors: Manage advisors (org admin only)
 * - Settings: Edit class details
 */
export default function ClassDetailPage({ classId: propClassId, orgId: propOrgId, onBack }) {
  const params = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const classId = propClassId || params.classId
  const orgId = propOrgId || params.orgId || user?.organization_id

  const [classData, setClassData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('students')

  const isOrgAdmin = user?.role === 'superadmin' || user?.org_role === 'org_admin'

  useEffect(() => {
    if (classId && orgId) {
      fetchClassData()
    }
  }, [classId, orgId])

  const fetchClassData = async () => {
    try {
      setLoading(true)
      const response = await classService.getClass(orgId, classId)
      if (response.success) {
        setClassData(response.class)
      } else {
        toast.error(response.error || 'Failed to load class')
      }
    } catch (error) {
      console.error('Failed to fetch class:', error)
      toast.error('Failed to load class details')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      navigate(-1)
    }
  }

  const handleUpdateClass = async (updates) => {
    try {
      const response = await classService.updateClass(orgId, classId, updates)
      if (response.success) {
        setClassData(response.class)
        toast.success('Class updated successfully')
      } else {
        toast.error(response.error || 'Failed to update class')
      }
    } catch (error) {
      console.error('Failed to update class:', error)
      toast.error(error.response?.data?.error || 'Failed to update class')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        <span className="ml-3 text-gray-500">Loading class...</span>
      </div>
    )
  }

  if (!classData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Class not found</p>
        <button
          onClick={handleBack}
          className="mt-4 text-optio-purple hover:underline"
        >
          Go back
        </button>
      </div>
    )
  }

  const tabs = [
    { id: 'students', label: 'Students', icon: UsersIcon, count: classData.student_count },
    { id: 'quests', label: 'Quests', icon: BookOpenIcon, count: classData.quest_count },
    ...(isOrgAdmin
      ? [{ id: 'advisors', label: 'Advisors', icon: UserGroupIcon, count: classData.advisor_count }]
      : []),
    { id: 'settings', label: 'Settings', icon: Cog6ToothIcon },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleBack}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{classData.name}</h1>
          {classData.description && (
            <p className="text-gray-500 mt-1">{classData.description}</p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="px-3 py-1 bg-optio-purple/10 text-optio-purple rounded-full text-sm font-medium">
            {classData.xp_threshold} XP to complete
          </span>
          {classData.status === 'archived' && (
            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
              Archived
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors
                ${
                  activeTab === tab.id
                    ? 'border-optio-purple text-optio-purple'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`
                  px-2 py-0.5 rounded-full text-xs
                  ${activeTab === tab.id ? 'bg-optio-purple/10 text-optio-purple' : 'bg-gray-100 text-gray-600'}
                `}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="py-4">
        {activeTab === 'students' && (
          <ClassStudentsTab
            orgId={orgId}
            classId={classId}
            classData={classData}
            onUpdate={fetchClassData}
          />
        )}
        {activeTab === 'quests' && (
          <ClassQuestsTab
            orgId={orgId}
            classId={classId}
            classData={classData}
            onUpdate={fetchClassData}
          />
        )}
        {activeTab === 'advisors' && isOrgAdmin && (
          <ClassAdvisorsTab
            orgId={orgId}
            classId={classId}
            classData={classData}
            onUpdate={fetchClassData}
          />
        )}
        {activeTab === 'settings' && (
          <ClassSettingsTab
            classData={classData}
            onUpdate={handleUpdateClass}
            isOrgAdmin={isOrgAdmin}
          />
        )}
      </div>
    </div>
  )
}
