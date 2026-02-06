import React from 'react'
import {
  MagnifyingGlassIcon,
  TrashIcon,
  UserPlusIcon
} from '@heroicons/react/24/outline'

/**
 * Section for managing parent-student connections.
 */
function ParentStudentSection({
  searchTerm,
  setSearchTerm,
  filteredParentLinks,
  setShowAddConnectionModal,
  setSelectedLink,
  setShowDisconnectModal
}) {
  return (
    <section className="bg-white rounded-lg shadow p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold mb-2">Parent-Student Connections</h3>
          <p className="text-gray-600 text-sm">Manage parent-student relationships and access</p>
        </div>
        <button
          onClick={() => setShowAddConnectionModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium"
        >
          <UserPlusIcon className="w-5 h-5" />
          Add Connection
        </button>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by parent or student name/email..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          />
        </div>
      </div>

      {/* Active Connections Table */}
      <div>
        {filteredParentLinks.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <UserPlusIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No active connections found</p>
          </div>
        ) : (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Parent</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Connected</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredParentLinks.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {link.parent?.first_name} {link.parent?.last_name}
                        </div>
                        <div className="text-sm text-gray-500">{link.parent?.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {link.student?.first_name} {link.student?.last_name}
                        </div>
                        <div className="text-sm text-gray-500">{link.student?.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(link.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedLink(link)
                          setShowDisconnectModal(true)
                        }}
                        className="inline-flex items-center px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                      >
                        <TrashIcon className="w-4 h-4 mr-1" />
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
    </section>
  )
}

export default ParentStudentSection
