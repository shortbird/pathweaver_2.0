import React from 'react'
import { UsersIcon, EyeIcon } from '@heroicons/react/24/outline'

/**
 * Overview section showing all students with their advisor counts.
 */
function AllStudentsOverview({ allStudentsWithAdvisors, handleViewStudentAdvisors }) {
  return (
    <section className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold mb-2">All Students Overview</h3>
        <p className="text-gray-600 text-sm">View advisor assignments for all students. Students can have multiple advisors.</p>
      </div>

      {allStudentsWithAdvisors.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
          <UsersIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p>No students found in this organization</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Advisors</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {allStudentsWithAdvisors.map((student) => (
                <tr key={student.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {student.display_name || `${student.first_name} ${student.last_name}`}
                      </div>
                      <div className="text-sm text-gray-500">{student.email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {student.advisor_count === 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        No advisors
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          {student.advisor_count} advisor{student.advisor_count > 1 ? 's' : ''}
                        </span>
                        {student.advisors?.slice(0, 2).map((advisor, idx) => (
                          <span key={advisor.advisor_id} className="text-xs text-gray-500">
                            {idx > 0 && ', '}
                            {advisor.display_name}
                          </span>
                        ))}
                        {student.advisor_count > 2 && (
                          <span className="text-xs text-gray-400">+{student.advisor_count - 2} more</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleViewStudentAdvisors(student)}
                      className="inline-flex items-center px-3 py-1 text-sm text-optio-purple hover:bg-purple-50 rounded-lg transition-colors font-medium gap-1"
                    >
                      <EyeIcon className="w-4 h-4" />
                      View Advisors
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default AllStudentsOverview
