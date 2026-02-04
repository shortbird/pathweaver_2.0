import React from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  UserPlusIcon,
  UsersIcon
} from '@heroicons/react/24/outline'

/**
 * Collapsible section for managing advisor-student and parent-student relationships.
 */
function RelationshipsSection({
  showRelationships,
  setShowRelationships,
  loading,
  relationshipView,
  setRelationshipView,
  // Advisor props
  advisors,
  selectedAdvisor,
  assignedStudents,
  expandedAdvisorId,
  handleSelectAdvisor,
  handleUnassignStudent,
  setShowAssignModal,
  // Parent props
  parentLinks,
  handleDisconnectParentLink,
  setShowAddConnectionModal
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <button
        onClick={() => setShowRelationships(!showRelationships)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <UsersIcon className="w-5 h-5 text-optio-purple" />
          <span className="font-semibold text-gray-900">Relationships</span>
          <span className="text-sm text-gray-500">Advisor-Student and Parent-Student connections</span>
        </div>
        <ChevronRightIcon className={`w-5 h-5 text-gray-400 transition-transform ${showRelationships ? 'rotate-90' : ''}`} />
      </button>

      {showRelationships && (
        <div className="px-6 pb-6 border-t border-gray-100">
          {loading ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple mx-auto"></div>
            </div>
          ) : (
            <>
              {/* Relationship Type Toggle */}
              <div className="flex gap-2 py-4">
                <button
                  onClick={() => setRelationshipView('advisors')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    relationshipView === 'advisors'
                      ? 'bg-optio-purple text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Advisors ({advisors.length})
                </button>
                <button
                  onClick={() => setRelationshipView('parents')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    relationshipView === 'parents'
                      ? 'bg-optio-purple text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Parents ({parentLinks.length})
                </button>
              </div>

              {relationshipView === 'advisors' ? (
                /* Advisor-Student Connections */
                <div className="space-y-3">
                  {advisors.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                      <UsersIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No advisors found in this organization</p>
                      <p className="text-sm mt-1">Invite users with the "advisor" role first</p>
                    </div>
                  ) : (
                    advisors.map(advisor => (
                      <div key={advisor.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => handleSelectAdvisor(advisor)}
                          className="w-full p-4 text-left flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900">
                                {advisor.display_name || `${advisor.first_name} ${advisor.last_name}`}
                              </p>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                advisor.role === 'org_admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {advisor.role === 'org_admin' ? 'Admin' : 'Advisor'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500">{advisor.email}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-medium text-optio-purple">
                              {advisor.assigned_students_count || 0} students
                            </span>
                            {expandedAdvisorId === advisor.id ? (
                              <ChevronUpIcon className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDownIcon className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                        </button>

                        {expandedAdvisorId === advisor.id && selectedAdvisor?.id === advisor.id && (
                          <div className="p-4 bg-white border-t border-gray-200">
                            <div className="flex justify-between items-center mb-4">
                              <h4 className="font-semibold text-gray-900">
                                Assigned Students ({assignedStudents.length})
                              </h4>
                              <button
                                onClick={() => setShowAssignModal(true)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium text-sm"
                              >
                                <UserPlusIcon className="w-4 h-4" />
                                Assign
                              </button>
                            </div>

                            {assignedStudents.length === 0 ? (
                              <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                                <p>No students assigned yet</p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {assignedStudents.map(student => (
                                  <div key={student.id} className="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                                    <div className="flex justify-between items-start">
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900 text-sm truncate">
                                          {student.display_name || `${student.first_name} ${student.last_name}`}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">{student.email}</p>
                                      </div>
                                      <button
                                        onClick={() => handleUnassignStudent(student.id)}
                                        className="ml-2 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                /* Parent-Student Connections */
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button
                      onClick={() => setShowAddConnectionModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium text-sm"
                    >
                      <UserPlusIcon className="w-4 h-4" />
                      Add Connection
                    </button>
                  </div>

                  {parentLinks.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                      <UserPlusIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No parent-student connections</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Parent</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Student</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Connected</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {parentLinks.map((link) => (
                            <tr key={link.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <p className="text-sm font-medium text-gray-900">
                                  {link.parent?.first_name} {link.parent?.last_name}
                                </p>
                                <p className="text-xs text-gray-500">{link.parent?.email}</p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-sm font-medium text-gray-900">
                                  {link.student?.first_name} {link.student?.last_name}
                                </p>
                                <p className="text-xs text-gray-500">{link.student?.email}</p>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                {new Date(link.created_at).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => handleDisconnectParentLink(link.id)}
                                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                                >
                                  Disconnect
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default RelationshipsSection
