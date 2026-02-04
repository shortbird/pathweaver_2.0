import React from 'react'

/**
 * Table displaying organization members with pagination.
 */
function MembersTable({
  filteredUsers,
  paginatedUsers,
  selectedUsers,
  selectAllVisible,
  toggleUserSelection,
  searchTerm,
  currentPage,
  setCurrentPage,
  totalPages,
  startIndex,
  usersPerPage,
  onEditUser
}) {
  const roleColors = {
    superadmin: 'bg-purple-100 text-purple-700',
    org_admin: 'bg-purple-100 text-purple-700',
    advisor: 'bg-blue-100 text-blue-700',
    parent: 'bg-green-100 text-green-700',
    observer: 'bg-yellow-100 text-yellow-700',
    student: 'bg-gray-100 text-gray-700'
  }

  const roleDisplayNames = {
    superadmin: 'Superadmin',
    org_admin: 'Org Admin',
    advisor: 'Advisor',
    parent: 'Parent',
    observer: 'Observer',
    student: 'Student'
  }

  const getDisplayRoles = (user) => {
    if (user.org_roles && Array.isArray(user.org_roles) && user.org_roles.length > 0) {
      return user.org_roles
    } else if (user.org_role) {
      return [user.org_role]
    } else if (user.role && user.role !== 'org_managed') {
      return [user.role]
    }
    return ['student']
  }

  const getUserName = (user) => {
    const name = user.display_name || (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name || user.last_name)
    return name
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Members ({filteredUsers.length})</h2>
      </div>
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="px-4 py-4 text-left">
              <input
                type="checkbox"
                checked={selectedUsers.size === paginatedUsers.length && paginatedUsers.length > 0}
                onChange={selectAllVisible}
                className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
              />
            </th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {paginatedUsers.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                {searchTerm ? 'No users match your search' : 'No users in this organization'}
              </td>
            </tr>
          ) : (
            paginatedUsers.map(user => {
              const name = getUserName(user)
              const displayRoles = getDisplayRoles(user)

              return (
                <tr key={user.id} className={`hover:bg-gray-50 ${selectedUsers.has(user.id) ? 'bg-optio-purple/5' : ''}`}>
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(user.id)}
                      onChange={() => toggleUserSelection(user.id)}
                      className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                    />
                  </td>
                  <td className="px-6 py-4">
                    {name ? (
                      <span className="text-gray-900">{name}</span>
                    ) : (
                      <span className="text-gray-400 italic">No name set</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {user.email ? (
                      user.email
                    ) : user.username ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">username</span>
                        {user.username}
                      </span>
                    ) : (
                      <span className="text-gray-400 italic">No email</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {displayRoles.map(role => (
                        <span
                          key={role}
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            roleColors[role] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {roleDisplayNames[role] || role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => onEditUser(user)}
                      className="text-optio-purple hover:underline text-sm font-medium"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {startIndex + 1} to {Math.min(startIndex + usersPerPage, filteredUsers.length)} of {filteredUsers.length} users
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (currentPage <= 3) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = currentPage - 2 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-1.5 border rounded-lg text-sm font-medium ${
                    currentPage === pageNum
                      ? 'bg-optio-purple text-white border-optio-purple'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default MembersTable
