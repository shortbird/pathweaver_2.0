import React from 'react'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  UserPlusIcon,
  UsersIcon
} from '@heroicons/react/24/outline'

/**
 * Section for managing advisor-student connections.
 */
function AdvisorStudentSection({
  advisors,
  selectedAdvisor,
  assignedStudents,
  expandedAdvisorId,
  handleSelectAdvisor,
  handleUnassignStudent,
  setShowAssignModal
}) {
  return (
    <section className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold mb-2">Advisor-Student Connections</h3>
        <p className="text-gray-600 text-sm">Assign students to advisors for check-ins and support</p>
      </div>

      {advisors.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
          <UsersIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p>No advisors found in this organization</p>
          <p className="text-sm mt-1">Invite users with the "advisor" role first</p>
        </div>
      ) : (
        <div className="space-y-3">
          {advisors.map(advisor => (
            <div key={advisor.id} className="border-2 border-gray-200 rounded-lg overflow-hidden hover:border-purple-300 transition-colors">
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
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium text-sm"
                    >
                      <UserPlusIcon className="w-4 h-4" />
                      Assign Student
                    </button>
                  </div>

                  {assignedStudents.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                      <p>No students assigned yet</p>
                      <p className="text-sm mt-1">Click "Assign Student" to get started</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
          ))}
        </div>
      )}
    </section>
  )
}

export default AdvisorStudentSection
