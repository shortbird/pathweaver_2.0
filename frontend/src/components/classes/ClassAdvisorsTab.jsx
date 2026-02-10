import React, { useState, useEffect } from 'react'
import {
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'
import api from '../../services/api'
import { ModalOverlay } from '../ui'

/**
 * ClassAdvisorsTab - Manage advisors assigned to a class (org admin only)
 */
export default function ClassAdvisorsTab({ orgId, classId, classData, onUpdate }) {
  const [advisors, setAdvisors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    fetchAdvisors()
  }, [orgId, classId])

  const fetchAdvisors = async () => {
    try {
      setLoading(true)
      const response = await classService.getClassAdvisors(orgId, classId)
      if (response.success) {
        setAdvisors(response.advisors || [])
      } else {
        toast.error(response.error || 'Failed to load advisors')
      }
    } catch (error) {
      console.error('Failed to fetch advisors:', error)
      toast.error('Failed to load advisors')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveAdvisor = async (advisorId) => {
    if (!confirm('Are you sure you want to remove this advisor from the class?')) {
      return
    }

    try {
      const response = await classService.removeClassAdvisor(orgId, classId, advisorId)
      if (response.success) {
        toast.success('Advisor removed from class')
        fetchAdvisors()
        onUpdate?.()
      } else {
        toast.error(response.error || 'Failed to remove advisor')
      }
    } catch (error) {
      console.error('Failed to remove advisor:', error)
      toast.error(error.response?.data?.error || 'Failed to remove advisor')
    }
  }

  const handleAddAdvisor = async (advisorId) => {
    try {
      const response = await classService.addClassAdvisor(orgId, classId, advisorId)
      if (response.success) {
        toast.success('Advisor added to class')
        setShowAddModal(false)
        fetchAdvisors()
        onUpdate?.()
      } else {
        toast.error(response.error || 'Failed to add advisor')
      }
    } catch (error) {
      console.error('Failed to add advisor:', error)
      toast.error(error.response?.data?.error || 'Failed to add advisor')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        <span className="ml-3 text-gray-500">Loading advisors...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-gray-600">
          Advisors can manage students and quests in this class
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          <PlusIcon className="w-5 h-5" />
          Add Advisor
        </button>
      </div>

      {/* Empty State */}
      {advisors.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <UserGroupIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No advisors assigned to this class yet</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-optio-purple text-white rounded-lg hover:bg-optio-purple/90 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Add First Advisor
          </button>
        </div>
      ) : (
        /* Advisor List */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {advisors.map((item) => {
            const advisor = item.users || {}
            const displayName =
              advisor.display_name ||
              `${advisor.first_name || ''} ${advisor.last_name || ''}`.trim() ||
              advisor.email ||
              'Unknown Advisor'

            return (
              <div
                key={item.id}
                className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200"
              >
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                  <UserCircleIcon className="w-10 h-10 text-gray-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{displayName}</p>
                  {advisor.email && displayName !== advisor.email && (
                    <p className="text-sm text-gray-500 truncate">{advisor.email}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Added {new Date(item.assigned_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Remove Button */}
                <button
                  onClick={() => handleRemoveAdvisor(item.advisor_id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove advisor"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Advisor Modal */}
      {showAddModal && (
        <AddAdvisorModal
          orgId={orgId}
          existingAdvisorIds={advisors.map((a) => a.advisor_id)}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddAdvisor}
        />
      )}
    </div>
  )
}

function AddAdvisorModal({ orgId, existingAdvisorIds = [], onClose, onSubmit }) {
  const [advisors, setAdvisors] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchOrgAdvisors()
  }, [orgId])

  const fetchOrgAdvisors = async () => {
    try {
      setLoading(true)
      // Get advisors from the organization
      const response = await api.get(`/api/admin/organizations/${orgId}/users?role=advisor`)
      if (response.data.success || response.data.users) {
        // Filter out already assigned advisors
        const existingSet = new Set(existingAdvisorIds)
        const available = (response.data.users || []).filter((u) => !existingSet.has(u.id))
        setAdvisors(available)
      }
    } catch (error) {
      console.error('Failed to fetch advisors:', error)
      toast.error('Failed to load available advisors')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (advisorId) => {
    setSubmitting(true)
    try {
      await onSubmit(advisorId)
    } finally {
      setSubmitting(false)
    }
  }

  const filteredAdvisors = advisors.filter((advisor) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      (advisor.display_name || '').toLowerCase().includes(term) ||
      (advisor.email || '').toLowerCase().includes(term) ||
      (advisor.first_name || '').toLowerCase().includes(term) ||
      (advisor.last_name || '').toLowerCase().includes(term)
    )
  })

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
              <UserGroupIcon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Add Advisor</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search advisors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* Advisor List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple"></div>
              <span className="ml-2 text-gray-500">Loading advisors...</span>
            </div>
          ) : advisors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No available advisors in this organization
            </div>
          ) : filteredAdvisors.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No advisors match your search
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAdvisors.map((advisor) => {
                const displayName =
                  advisor.display_name ||
                  `${advisor.first_name || ''} ${advisor.last_name || ''}`.trim() ||
                  advisor.email

                return (
                  <div
                    key={advisor.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <UserCircleIcon className="w-8 h-8 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{displayName}</p>
                      {displayName !== advisor.email && (
                        <p className="text-sm text-gray-500 truncate">{advisor.email}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleAdd(advisor.id)}
                      disabled={submitting}
                      className="px-3 py-1.5 bg-optio-purple text-white text-sm rounded-lg hover:bg-optio-purple/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Add
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}
