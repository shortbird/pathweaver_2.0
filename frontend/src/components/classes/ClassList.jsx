import React, { useState, useEffect } from 'react'
import { PlusIcon, AcademicCapIcon, UsersIcon, BookOpenIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'
import ClassCard from './ClassCard'
import CreateClassModal from './CreateClassModal'

/**
 * ClassList - Display list of classes for an organization or advisor
 *
 * Used in:
 * - Organization Management > Classes tab (org admin view)
 * - Advisor Classes page (advisor view)
 */
export default function ClassList({ orgId, isAdvisorView = false, onSelectClass }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    fetchClasses()
  }, [orgId, showArchived, isAdvisorView])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      const status = showArchived ? 'archived' : 'active'

      let response
      if (isAdvisorView) {
        response = await classService.getMyClasses({ status })
      } else {
        response = await classService.getOrgClasses(orgId, { status })
      }

      if (response.success) {
        setClasses(response.classes || [])
      } else {
        toast.error(response.error || 'Failed to load classes')
      }
    } catch (error) {
      console.error('Failed to fetch classes:', error)
      toast.error('Failed to load classes')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateClass = async (classData) => {
    try {
      const response = await classService.createClass(orgId, classData)
      if (response.success) {
        toast.success('Class created successfully')
        setShowCreateModal(false)
        fetchClasses()
        if (onSelectClass) {
          onSelectClass(response.class)
        }
      } else {
        toast.error(response.error || 'Failed to create class')
      }
    } catch (error) {
      console.error('Failed to create class:', error)
      toast.error(error.response?.data?.error || 'Failed to create class')
    }
  }

  const handleArchiveClass = async (classId) => {
    if (!confirm('Are you sure you want to archive this class? Students will no longer see it.')) {
      return
    }

    try {
      const response = await classService.archiveClass(orgId, classId)
      if (response.success) {
        toast.success('Class archived successfully')
        fetchClasses()
      } else {
        toast.error(response.error || 'Failed to archive class')
      }
    } catch (error) {
      console.error('Failed to archive class:', error)
      toast.error(error.response?.data?.error || 'Failed to archive class')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        <span className="ml-3 text-gray-500">Loading classes...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {isAdvisorView ? 'My Classes' : 'Classes'}
          </h2>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              showArchived
                ? 'bg-gray-200 text-gray-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <ArchiveBoxIcon className="w-4 h-4" />
            {showArchived ? 'Showing Archived' : 'Show Archived'}
          </button>
        </div>

        {!isAdvisorView && !showArchived && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            <PlusIcon className="w-5 h-5" />
            Create Class
          </button>
        )}
      </div>

      {/* Empty State */}
      {classes.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <AcademicCapIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {showArchived ? 'No archived classes' : 'No classes yet'}
          </h3>
          <p className="text-gray-500 mb-4">
            {showArchived
              ? 'Archived classes will appear here'
              : isAdvisorView
                ? 'You have not been assigned to any classes yet'
                : 'Create a class to group students and assign quests'}
          </p>
          {!isAdvisorView && !showArchived && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-optio-purple text-white rounded-lg hover:bg-optio-purple/90 transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Create Your First Class
            </button>
          )}
        </div>
      ) : (
        /* Class Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls) => (
            <ClassCard
              key={cls.id}
              classData={cls}
              onClick={() => onSelectClass?.(cls)}
              onArchive={!isAdvisorView && !showArchived ? () => handleArchiveClass(cls.id) : null}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateClassModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateClass}
        />
      )}
    </div>
  )
}
