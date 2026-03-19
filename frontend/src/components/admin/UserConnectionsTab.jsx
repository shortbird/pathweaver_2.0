import React, { useState, useEffect, memo } from 'react'
import api, { adminParentConnectionsAPI } from '../../services/api'
import toast from 'react-hot-toast'
import { TrashIcon, UserPlusIcon, MagnifyingGlassIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

/**
 * UserConnectionsTab - Shows and manages connections for a specific user
 * within the UserDetailsModal. Contextual to the user's role:
 * - Students: shows their advisors, parents, and observers
 * - Advisors: shows their assigned students
 * - Parents: shows their linked children
 * - Observers: shows students they can observe
 */
const UserConnectionsTab = ({ user }) => {
  const [loading, setLoading] = useState(true)
  const [connections, setConnections] = useState([])

  // Add connection state
  const [showAddForm, setShowAddForm] = useState(false)
  const [addType, setAddType] = useState(null) // 'advisor', 'parent', 'student', 'observer'
  const [candidates, setCandidates] = useState([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [addLoading, setAddLoading] = useState(false)

  const effectiveRole = user.org_role || user.role || 'student'

  useEffect(() => {
    loadConnections()
  }, [user.id])

  const loadConnections = async () => {
    setLoading(true)
    try {
      const results = []

      // Check if user is an advisor - load their students
      if (effectiveRole === 'advisor' || effectiveRole === 'superadmin') {
        try {
          const res = await api.get(`/api/admin/advisors/${user.id}/students`)
          const students = res.data.students || []
          for (const s of students) {
            results.push({
              id: `advisor-${user.id}-${s.id}`,
              type: 'advisor',
              direction: 'student',
              person: {
                id: s.id,
                name: `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.display_name || 'Unknown',
                email: s.email
              },
              created_at: s.assigned_at
            })
          }
        } catch {
          // User may not be a registered advisor
        }
      }

      // Check if user is a parent - load their linked children
      try {
        const parentRes = await adminParentConnectionsAPI.getActiveLinks({ parent_id: user.id })
        const parentLinks = parentRes.data.links || []
        for (const link of parentLinks) {
          results.push({
            id: `parent-${link.id}`,
            originalId: link.id,
            type: 'parent',
            direction: 'child',
            person: {
              id: link.student?.id || link.student_user_id,
              name: `${link.student?.first_name || ''} ${link.student?.last_name || ''}`.trim() || 'Unknown',
              email: link.student?.email
            },
            created_at: link.created_at
          })
        }
      } catch {
        // Not a parent or no links
      }

      // Check if user is a student - load their advisors and parents
      try {
        const studentParentRes = await adminParentConnectionsAPI.getActiveLinks({ student_id: user.id })
        const studentParentLinks = studentParentRes.data.links || []
        for (const link of studentParentLinks) {
          results.push({
            id: `parent-of-${link.id}`,
            originalId: link.id,
            type: 'parent',
            direction: 'parent',
            person: {
              id: link.parent?.id || link.parent_user_id,
              name: `${link.parent?.first_name || ''} ${link.parent?.last_name || ''}`.trim() || 'Unknown',
              email: link.parent?.email
            },
            created_at: link.created_at
          })
        }
      } catch {
        // No parent links
      }

      // Load advisor connections where this user is the student
      try {
        const allAdvisors = await api.get('/api/admin/advisors')
        const advisorList = allAdvisors.data.advisors || []
        for (const advisor of advisorList) {
          try {
            const studentsRes = await api.get(`/api/admin/advisors/${advisor.id}/students`)
            const assignedStudents = studentsRes.data.students || []
            const match = assignedStudents.find(s => s.id === user.id)
            if (match) {
              results.push({
                id: `advisor-of-${advisor.id}-${user.id}`,
                type: 'advisor',
                direction: 'advisor',
                advisorId: advisor.id,
                person: {
                  id: advisor.id,
                  name: `${advisor.first_name || ''} ${advisor.last_name || ''}`.trim() || advisor.display_name || 'Unknown',
                  email: advisor.email
                },
                created_at: match.assigned_at
              })
            }
          } catch {
            // Skip
          }
        }
      } catch {
        // No advisor data
      }

      // Load observer connections (both directions)
      try {
        const observerRes = await api.get(`/api/admin/users/${user.id}/observer-links`)
        const observerLinks = observerRes.data.data?.links || []
        for (const link of observerLinks) {
          const u = link.user || {}
          results.push({
            id: `observer-${link.id}`,
            observerLinkId: link.id,
            type: 'observer',
            direction: link.direction, // 'observing' or 'observed_by'
            person: {
              id: u.id,
              name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.display_name || 'Unknown',
              email: u.email
            },
            relationship: link.relationship,
            created_at: link.created_at
          })
        }
      } catch {
        // No observer links
      }

      // Deduplicate by person id + type + direction
      const seen = new Set()
      const deduped = results.filter(r => {
        const key = `${r.type}-${r.direction}-${r.person.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      setConnections(deduped)
    } catch (error) {
      console.error('Error loading connections:', error)
      toast.error('Failed to load connections')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (conn) => {
    const confirmMsg = conn.direction === 'student'
      ? `Remove ${conn.person.name} from this user's students?`
      : conn.direction === 'child'
      ? `Remove parent connection to ${conn.person.name}?`
      : conn.direction === 'parent'
      ? `Remove ${conn.person.name} as parent?`
      : conn.direction === 'observing'
      ? `Remove observer access to ${conn.person.name}?`
      : conn.direction === 'observed_by'
      ? `Remove ${conn.person.name} as observer?`
      : `Remove ${conn.person.name} as advisor?`

    if (!window.confirm(confirmMsg)) return

    try {
      if (conn.type === 'observer') {
        await api.delete(`/api/admin/users/${user.id}/observer-links/${conn.observerLinkId}`)
      } else if (conn.type === 'advisor') {
        if (conn.direction === 'student') {
          await api.delete(`/api/admin/advisors/${user.id}/students/${conn.person.id}`)
        } else {
          await api.delete(`/api/admin/advisors/${conn.advisorId || conn.person.id}/students/${user.id}`)
        }
      } else {
        await adminParentConnectionsAPI.disconnectLink(conn.originalId)
      }
      toast.success('Connection removed')
      loadConnections()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to remove connection')
    }
  }

  const openAddForm = async (type) => {
    setAddType(type)
    setShowAddForm(true)
    setSearchTerm('')
    setSelectedIds([])
    setCandidatesLoading(true)

    try {
      if (type === 'student') {
        const res = await adminParentConnectionsAPI.getAllUsers({ role: 'student', per_page: 200 })
        const allStudents = res.data.users || []
        const connectedIds = connections
          .filter(c => c.direction === 'student' || c.direction === 'child' || c.direction === 'observing')
          .map(c => c.person.id)
        setCandidates(allStudents.filter(s => !connectedIds.includes(s.id) && s.id !== user.id))
      } else if (type === 'advisor') {
        const res = await api.get('/api/admin/advisors')
        const allAdvisors = res.data.advisors || []
        const connectedIds = connections
          .filter(c => c.direction === 'advisor')
          .map(c => c.person.id)
        setCandidates(allAdvisors.filter(a => !connectedIds.includes(a.id) && a.id !== user.id))
      } else if (type === 'parent') {
        const res = await adminParentConnectionsAPI.getAllUsers({ role: 'parent', per_page: 200 })
        const allParents = res.data.users || []
        const connectedIds = connections
          .filter(c => c.direction === 'parent')
          .map(c => c.person.id)
        setCandidates(allParents.filter(p => !connectedIds.includes(p.id) && p.id !== user.id))
      } else if (type === 'observer') {
        // Load all users who could be observers (any role)
        const res = await adminParentConnectionsAPI.getAllUsers({ per_page: 200 })
        const allUsers = res.data.users || []
        const connectedIds = connections
          .filter(c => c.direction === 'observed_by')
          .map(c => c.person.id)
        setCandidates(allUsers.filter(u => !connectedIds.includes(u.id) && u.id !== user.id))
      }
    } catch (error) {
      toast.error('Failed to load users')
    } finally {
      setCandidatesLoading(false)
    }
  }

  const handleAdd = async () => {
    if (selectedIds.length === 0) return
    setAddLoading(true)

    try {
      if (addType === 'student') {
        if (effectiveRole === 'advisor' || effectiveRole === 'superadmin') {
          await Promise.all(selectedIds.map(id =>
            api.post(`/api/admin/advisors/${user.id}/students`, { student_id: id })
          ))
        } else {
          await Promise.all(selectedIds.map(id =>
            adminParentConnectionsAPI.createManualLink(user.id, id, '')
          ))
        }
      } else if (addType === 'advisor') {
        await Promise.all(selectedIds.map(id =>
          api.post(`/api/admin/advisors/${id}/students`, { student_id: user.id })
        ))
      } else if (addType === 'parent') {
        await Promise.all(selectedIds.map(id =>
          adminParentConnectionsAPI.createManualLink(id, user.id, '')
        ))
      } else if (addType === 'observer') {
        // Adding observers to this student
        await Promise.all(selectedIds.map(id =>
          api.post(`/api/admin/users/${user.id}/observer-links`, {
            other_user_id: id,
            direction: 'observed_by'
          })
        ))
      }

      toast.success(`Added ${selectedIds.length} connection(s)`)
      setShowAddForm(false)
      loadConnections()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add connection')
    } finally {
      setAddLoading(false)
    }
  }

  const filteredCandidates = candidates.filter(c => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      c.first_name?.toLowerCase().includes(search) ||
      c.last_name?.toLowerCase().includes(search) ||
      c.email?.toLowerCase().includes(search)
    )
  })

  const toggleSelection = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getLabel = (conn) => {
    if (conn.direction === 'student') return 'Student'
    if (conn.direction === 'child') return 'Child'
    if (conn.direction === 'advisor') return 'Advisor'
    if (conn.direction === 'parent') return 'Parent'
    if (conn.direction === 'observing') return 'Observing'
    if (conn.direction === 'observed_by') return 'Observer'
    return conn.type
  }

  const getBadgeColor = (conn) => {
    if (conn.direction === 'advisor') return 'bg-yellow-100 text-yellow-800'
    if (conn.direction === 'parent') return 'bg-green-100 text-green-800'
    if (conn.direction === 'student' || conn.direction === 'child') return 'bg-blue-100 text-blue-800'
    if (conn.direction === 'observing' || conn.direction === 'observed_by') return 'bg-purple-100 text-purple-800'
    return 'bg-gray-100 text-gray-800'
  }

  const getAddTypeLabel = () => {
    if (addType === 'advisor') return 'Advisor'
    if (addType === 'parent') return 'Parent'
    if (addType === 'student') return 'Student'
    if (addType === 'observer') return 'Observer'
    return ''
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Add Connection Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => openAddForm('advisor')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors"
        >
          <UserPlusIcon className="w-4 h-4" />
          Add Advisor
        </button>
        <button
          onClick={() => openAddForm('parent')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
        >
          <UserPlusIcon className="w-4 h-4" />
          Add Parent
        </button>
        <button
          onClick={() => openAddForm('student')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <UserPlusIcon className="w-4 h-4" />
          Add Student
        </button>
        <button
          onClick={() => openAddForm('observer')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
        >
          <UserPlusIcon className="w-4 h-4" />
          Add Observer
        </button>
      </div>

      {/* Connections List */}
      {connections.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <UserPlusIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="font-medium">No connections</p>
          <p className="text-sm mt-1">Use the buttons above to add connections.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          {connections.map(conn => (
            <div key={conn.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${getBadgeColor(conn)}`}>
                  {getLabel(conn)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{conn.person.name}</p>
                  <p className="text-xs text-gray-500 truncate">{conn.person.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                {conn.created_at && (
                  <span className="text-xs text-gray-400 hidden sm:block">{formatDate(conn.created_at)}</span>
                )}
                <button
                  onClick={() => handleRemove(conn)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove connection"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Connection Inline Form */}
      {showAddForm && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold text-gray-900">
              Add {getAddTypeLabel()}
            </h4>
            <button
              onClick={() => setShowAddForm(false)}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${addType}s...`}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>

          {/* Candidates list */}
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white">
            {candidatesLoading ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple"></div>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                {candidates.length === 0 ? 'No available users' : 'No matches found'}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredCandidates.map(c => (
                  <button
                    key={c.id}
                    onClick={() => toggleSelection(c.id)}
                    className={`w-full text-left p-2.5 transition-colors flex items-center gap-2.5 ${
                      selectedIds.includes(c.id) ? 'bg-purple-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedIds.includes(c.id)
                        ? 'bg-optio-purple border-optio-purple'
                        : 'border-gray-300'
                    }`}>
                      {selectedIds.includes(c.id) && (
                        <CheckCircleIcon className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {`${c.first_name || ''} ${c.last_name || ''}`.trim() || c.display_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{c.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add button */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={selectedIds.length === 0 || addLoading}
              className="px-3 py-1.5 text-sm bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addLoading ? 'Adding...' : `Add (${selectedIds.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(UserConnectionsTab)
