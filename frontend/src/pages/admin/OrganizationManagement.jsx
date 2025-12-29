import React, { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useOrganization } from '../../contexts/OrganizationContext';
import api from '../../services/api';
import QuestVisibilityManager from '../../components/admin/QuestVisibilityManager';

const CourseImport = lazy(() => import('../../components/admin/CourseImport'));

export default function OrganizationManagement() {
  const { orgId: urlOrgId } = useParams();
  const { user } = useAuth();
  const { refreshOrganization } = useOrganization();

  // Use URL param if available (admin route), otherwise use user's organization
  const orgId = urlOrgId || user?.organization_id;

  const [orgData, setOrgData] = useState(null);
  const [siteSettings, setSiteSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (orgId) {
      fetchOrganizationData();
      fetchSiteSettings();
    }
  }, [orgId]);

  const fetchOrganizationData = async () => {
    try {
      const { data } = await api.get(`/api/admin/organizations/${orgId}`);
      setOrgData(data);
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSiteSettings = async () => {
    try {
      const { data } = await api.get('/api/settings');
      setSiteSettings(data.settings || data);
    } catch (error) {
      console.error('Failed to fetch site settings:', error);
    }
  };

  if (!orgId) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center text-gray-500">
          <p>You are not assigned to an organization.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        </div>
      </div>
    );
  }

  if (!orgData) {
    return (
      <div className="container mx-auto p-8">
        <div className="text-center text-gray-500">
          <p>Organization not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">{orgData.organization.name}</h1>

      <div className="mb-6 border-b">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 ${activeTab === 'overview' ? 'border-b-2 border-optio-purple font-medium' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 ${activeTab === 'users' ? 'border-b-2 border-optio-purple font-medium' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('quests')}
            className={`px-4 py-2 ${activeTab === 'quests' ? 'border-b-2 border-optio-purple font-medium' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Quests
          </button>
          <button
            onClick={() => setActiveTab('curriculum')}
            className={`px-4 py-2 ${activeTab === 'curriculum' ? 'border-b-2 border-optio-purple font-medium' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Curriculum
          </button>
        </nav>
      </div>

      {activeTab === 'overview' && <OverviewTab orgId={orgId} orgData={orgData} onUpdate={fetchOrganizationData} onLogoChange={refreshOrganization} />}
      {activeTab === 'users' && <UsersTab orgId={orgId} users={orgData.users} onUpdate={fetchOrganizationData} />}
      {activeTab === 'quests' && <QuestsTab orgId={orgId} orgData={orgData} onUpdate={fetchOrganizationData} siteSettings={siteSettings} />}
      {activeTab === 'curriculum' && <CurriculumTab orgId={orgId} orgData={orgData} />}
    </div>
  );
}

function OverviewTab({ orgId, orgData, onUpdate, onLogoChange }) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logoUrl, setLogoUrl] = useState(orgData?.organization?.branding_config?.logo_url || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Lazy load analytics
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const { data } = await api.get(`/api/admin/organizations/${orgId}/analytics`);
        setAnalytics(data);
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
        setAnalytics({ total_users: 0, total_completions: 0, total_xp: 0 });
      } finally {
        setAnalyticsLoading(false);
      }
    };
    fetchAnalytics();
  }, [orgId]);

  const policyLabels = {
    all_optio: 'All Optio Quests + Org Quests',
    curated: 'Curated Quests + Org Quests',
    private_only: 'Organization Quests Only'
  };

  const registrationUrl = `${window.location.origin}/join/${orgData.organization.slug}`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Image must be less than 2MB');
      return;
    }

    setUploadingLogo(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result;
          await api.put(`/api/admin/organizations/${orgId}`, {
            branding_config: {
              ...orgData?.organization?.branding_config,
              logo_url: base64
            }
          });
          setLogoUrl(base64);
          onUpdate();
          // Refresh header logo
          if (onLogoChange) onLogoChange();
        } catch (error) {
          console.error('Failed to upload logo:', error);
          alert(error.response?.data?.error || 'Failed to upload logo');
        } finally {
          setUploadingLogo(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to read file:', error);
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!confirm('Remove organization logo?')) return;

    setSaving(true);
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        branding_config: {
          ...orgData?.organization?.branding_config,
          logo_url: null
        }
      });
      setLogoUrl('');
      onUpdate();
      // Refresh header logo
      if (onLogoChange) onLogoChange();
    } catch (error) {
      console.error('Failed to remove logo:', error);
      alert(error.response?.data?.error || 'Failed to remove logo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6">
      {/* Organization Details */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">Organization Details</h2>
          <button
            onClick={() => setShowEditModal(true)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Edit
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="font-medium text-gray-600">Name</dt>
            <dd className="text-lg">{orgData.organization.name}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Slug</dt>
            <dd className="text-lg font-mono">{orgData.organization.slug}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Quest Visibility Policy</dt>
            <dd className="text-lg">{policyLabels[orgData.organization.quest_visibility_policy]}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-600">Status</dt>
            <dd className="text-lg">
              {orgData.organization.is_active ? (
                <span className="text-green-600">Active</span>
              ) : (
                <span className="text-red-600">Inactive</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Registration URL */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-2">Registration URL</h2>
        <p className="text-gray-600 mb-4">Share this link with users to join your organization.</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 font-mono text-sm text-gray-700 truncate">
            {registrationUrl}
          </div>
          <button
            onClick={handleCopyUrl}
            className={`px-4 py-3 font-medium rounded-lg transition-all ${
              copied
                ? 'bg-green-100 text-green-700'
                : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90'
            }`}
          >
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
        </div>
      </div>

      {/* Organization Logo */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold mb-2">Organization Logo</h2>
        <p className="text-gray-600 mb-4">
          Your logo appears in the header for users in your organization.
        </p>

        <div className="flex items-start gap-6">
          <div className="flex-shrink-0">
            <div className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Organization logo"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-center text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs">No logo</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap gap-3">
              <label className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 cursor-pointer transition-colors">
                {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo}
                  className="hidden"
                />
              </label>
              {logoUrl && (
                <button
                  onClick={handleRemoveLogo}
                  disabled={saving}
                  className="px-4 py-2 text-red-600 font-medium rounded-lg hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-3">
              Requirements: PNG or SVG format, 2MB max
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total Users</h3>
          {analyticsLoading ? (
            <div className="h-9 w-16 bg-gray-200 rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold">{analytics?.total_users ?? 0}</p>
          )}
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Quest Completions</h3>
          {analyticsLoading ? (
            <div className="h-9 w-16 bg-gray-200 rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold">{analytics?.total_completions ?? 0}</p>
          )}
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total XP Earned</h3>
          {analyticsLoading ? (
            <div className="h-9 w-16 bg-gray-200 rounded animate-pulse" />
          ) : (
            <p className="text-3xl font-bold">{(analytics?.total_xp ?? 0).toLocaleString()}</p>
          )}
        </div>
      </div>

      {showEditModal && (
        <EditOrganizationModal
          orgId={orgId}
          orgData={orgData}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            onUpdate();
          }}
        />
      )}
    </div>
  );
}

function EditOrganizationModal({ orgId, orgData, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: orgData?.organization?.name || '',
    slug: orgData?.organization?.slug || ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.put(`/api/admin/organizations/${orgId}`, formData);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Edit Organization</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              pattern="[a-z0-9-]+"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, hyphens only. This changes the registration URL.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsersTab({ orgId, users, onUpdate }) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 25;

  const handleRemoveUser = async (userId, userName) => {
    if (!confirm(`Remove ${userName} from this organization?`)) return;

    try {
      await api.post(`/api/admin/organizations/${orgId}/users/remove`, {
        user_id: userId
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to remove user:', error);
      alert(error.response?.data?.error || 'Failed to remove user');
    }
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setShowEditModal(true);
  };

  // Filter users by search term and role
  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    const fullName = user.display_name || `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const matchesSearch = (
      fullName.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower)
    );
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const paginatedUsers = filteredUsers.slice(startIndex, startIndex + usersPerPage);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4 justify-between items-center">
        <h2 className="text-xl font-bold">Organization Users ({filteredUsers.length})</h2>
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-gray-200 rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          >
            <option value="all">All Roles</option>
            <option value="student">Student</option>
            <option value="parent">Parent</option>
            <option value="advisor">Advisor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                  {searchTerm ? 'No users match your search' : 'No users in this organization'}
                </td>
              </tr>
            ) : (
              paginatedUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    {(() => {
                      const name = user.display_name || (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name || user.last_name);
                      return name ? (
                        <span className="text-gray-900">{name}</span>
                      ) : (
                        <span className="text-gray-400 italic">No name set</span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                      user.role === 'admin' || user.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                      user.role === 'advisor' ? 'bg-blue-100 text-blue-700' :
                      user.role === 'parent' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleEditUser(user)}
                      className="text-optio-purple hover:underline text-sm font-medium"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
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
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
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
              );
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

      {showEditModal && selectedUser && (
        <EditUserModal
          orgId={orgId}
          user={selectedUser}
          onClose={() => {
            setShowEditModal(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setSelectedUser(null);
            onUpdate();
          }}
          onRemove={() => {
            const name = selectedUser.display_name || (selectedUser.first_name && selectedUser.last_name ? `${selectedUser.first_name} ${selectedUser.last_name}` : selectedUser.first_name || selectedUser.last_name) || selectedUser.email;
            handleRemoveUser(selectedUser.id, name);
            setShowEditModal(false);
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
}

function EditUserModal({ orgId, user, onClose, onSuccess, onRemove }) {
  const [formData, setFormData] = useState({
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
    role: user.role || 'student'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Update user info
      await api.put(`/api/admin/users/${user.id}`, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email
      });

      // Update role separately if changed
      if (formData.role !== user.role) {
        await api.put(`/api/admin/users/${user.id}/role`, {
          role: formData.role
        });
      }

      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Edit User</h2>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">First Name</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Last Name</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
            >
              <option value="student">Student</option>
              <option value="parent">Parent</option>
              <option value="advisor">Advisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => {
                const name = user.display_name || (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name || user.last_name) || user.email;
                if (confirm(`Remove ${name} from this organization?`)) {
                  onRemove();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-full text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Remove
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuestsTab({ orgId, orgData, onUpdate, siteSettings }) {
  const [policy, setPolicy] = useState(orgData?.organization?.quest_visibility_policy || 'all_optio');
  const [saving, setSaving] = useState(false);
  const [showPolicyOptions, setShowPolicyOptions] = useState(false);
  const [questSubTab, setQuestSubTab] = useState('manage'); // 'manage' or 'import'

  const policyOptions = [
    { value: 'all_optio', label: 'All Optio + Org Quests', short: 'All quests available' },
    { value: 'curated', label: 'Curated Library', short: 'You control availability' },
    { value: 'private_only', label: 'Org Quests Only', short: 'Only your quests' }
  ];

  const currentPolicy = policyOptions.find(p => p.value === policy);

  const handleSavePolicy = async (newPolicy) => {
    setSaving(true);
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        quest_visibility_policy: newPolicy
      });
      setPolicy(newPolicy);
      setShowPolicyOptions(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to update policy:', error);
      alert(error.response?.data?.error || 'Failed to update policy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Subtab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setQuestSubTab('manage')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            questSubTab === 'manage'
              ? 'bg-white border border-b-white border-gray-200 -mb-[3px] text-optio-purple'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Manage Quests
        </button>
        <button
          onClick={() => setQuestSubTab('import')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            questSubTab === 'import'
              ? 'bg-white border border-b-white border-gray-200 -mb-[3px] text-optio-purple'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Import Course
        </button>
      </div>

      {questSubTab === 'manage' ? (
        <>
          {/* Quest Visibility Policy - Compact */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-500">Visibility Policy:</span>
                <span className="ml-2 font-semibold text-gray-900">{currentPolicy?.label}</span>
                <span className="ml-2 text-sm text-gray-500">({currentPolicy?.short})</span>
              </div>
              <button
                onClick={() => setShowPolicyOptions(!showPolicyOptions)}
                className="text-sm text-optio-purple hover:underline font-medium"
              >
                {showPolicyOptions ? 'Cancel' : 'Change'}
              </button>
            </div>

            {showPolicyOptions && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex flex-wrap gap-2">
                  {policyOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleSavePolicy(option.value)}
                      disabled={saving || option.value === orgData?.organization?.quest_visibility_policy}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        option.value === orgData?.organization?.quest_visibility_policy
                          ? 'bg-optio-purple text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      } disabled:opacity-50`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {policy === 'curated' ? 'Toggle availability for each quest below.' :
                   policy === 'private_only' ? 'Only quests created by your organization will be visible.' :
                   'All Optio quests are automatically available to students.'}
                </p>
              </div>
            )}
          </div>

          {/* Quest Visibility Manager */}
          <QuestVisibilityManager
            orgId={orgId}
            orgData={orgData}
            onUpdate={onUpdate}
            siteSettings={siteSettings}
          />
        </>
      ) : (
        <Suspense fallback={
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
          </div>
        }>
          <CourseImport organizationId={orgId} />
        </Suspense>
      )}
    </div>
  );
}

function CurriculumTab({ orgId, orgData }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      // Fetch only quests that have curriculum projects (at least one lesson)
      const response = await api.get(`/api/quests/curriculum-projects/${orgId}`);
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error('Failed to fetch curriculum projects:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [orgId]);

  const filteredProjects = projects.filter(project =>
    project.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Curriculum Builder</h2>
          <p className="text-sm text-gray-600 mt-1">
            Create and manage curriculum content for your organization's quests
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search quests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-gray-200 rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          />
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Build New Curriculum
          </button>
        </div>
      </div>

      {showCreateModal && (
        <CreateCurriculumModal
          orgId={orgId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchProjects();
          }}
        />
      )}

      {/* Curriculum Projects Grid */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-gray-500">
            {searchTerm ? 'No curriculum projects match your search' : 'No curriculum projects yet. Click "Build New Curriculum" to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredProjects.map(project => (
            <CurriculumProjectCard
              key={project.id}
              project={project}
              onDelete={(id) => setProjects(prev => prev.filter(p => p.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CurriculumProjectCard({ project, onDelete }) {
  const lessonCount = project.lesson_count || 0;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/admin/quests/${project.id}`);
      onDelete(project.id);
    } catch (err) {
      console.error('Failed to delete quest:', err);
      alert('Failed to delete curriculum project');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:border-optio-purple/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 truncate">{project.title}</h3>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{project.description || 'No description'}</p>
          <div className="flex items-center gap-3 mt-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
            </span>
            <span className="text-xs text-gray-500">
              {project.quest_type || 'standard'} quest
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/quests/${project.id}/curriculum/edit`}
            className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </Link>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete curriculum project"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-xl p-6 max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Curriculum Project?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete "{project.title}" and all its lessons. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateCurriculumModal({ orgId, onClose, onSuccess }) {
  const [mode, setMode] = useState('new'); // 'new' or 'existing'
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    quest_type: 'course'
  });
  const [selectedQuestId, setSelectedQuestId] = useState('');
  const [availableQuests, setAvailableQuests] = useState([]);
  const [loadingQuests, setLoadingQuests] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch available quests when mode changes to 'existing'
  useEffect(() => {
    if (mode === 'existing') {
      setLoadingQuests(true);
      api.get(`/api/quests/available-quests/${orgId}`)
        .then(res => {
          setAvailableQuests(res.data.quests || []);
        })
        .catch(err => {
          console.error('Failed to fetch available quests:', err);
          setError('Failed to load available quests');
        })
        .finally(() => setLoadingQuests(false));
    }
  }, [mode, orgId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let questId;

      if (mode === 'new') {
        // Create new quest in draft mode
        const response = await api.post('/api/admin/quests/create', {
          title: formData.title,
          description: formData.description,
          quest_type: formData.quest_type,
          organization_id: orgId,
          is_active: false,
          is_public: false
        });
        questId = response.data.quest?.id || response.data.id;

        // Create an initial lesson so the quest appears in the curriculum list
        if (questId) {
          try {
            await api.post(`/api/quests/${questId}/curriculum/lessons`, {
              title: 'Introduction',
              description: '',
              content: { blocks: [] },
              is_published: false
            });
          } catch (lessonErr) {
            console.warn('Failed to create initial lesson:', lessonErr);
            // Continue anyway - user can create lessons manually
          }
        }
      } else {
        // Use selected existing quest
        if (!selectedQuestId) {
          setError('Please select a quest');
          setLoading(false);
          return;
        }
        questId = selectedQuestId;

        // Create an initial lesson for existing quest too
        try {
          await api.post(`/api/quests/${questId}/curriculum/lessons`, {
            title: 'Introduction',
            description: '',
            content: { blocks: [] },
            is_published: false
          });
        } catch (lessonErr) {
          console.warn('Failed to create initial lesson:', lessonErr);
        }
      }

      if (questId) {
        window.location.href = `/quests/${questId}/curriculum/edit`;
      } else {
        onSuccess();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create curriculum');
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-2">Build New Curriculum</h2>
        <p className="text-gray-600 mb-6">
          Create curriculum content for a new or existing quest.
        </p>

        {/* Mode Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Choose an option</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                mode === 'new'
                  ? 'border-optio-purple bg-optio-purple/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className={`w-5 h-5 ${mode === 'new' ? 'text-optio-purple' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className={`font-medium ${mode === 'new' ? 'text-optio-purple' : 'text-gray-700'}`}>Create New Quest</span>
              </div>
              <p className="text-xs text-gray-500">Start fresh with a new quest</p>
            </button>
            <button
              type="button"
              onClick={() => setMode('existing')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                mode === 'existing'
                  ? 'border-optio-purple bg-optio-purple/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <svg className={`w-5 h-5 ${mode === 'existing' ? 'text-optio-purple' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className={`font-medium ${mode === 'existing' ? 'text-optio-purple' : 'text-gray-700'}`}>Use Existing Quest</span>
              </div>
              <p className="text-xs text-gray-500">Add curriculum to a quest</p>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'new' ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                  placeholder="e.g., Introduction to Photography"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                  placeholder="Brief description of what students will learn..."
                  rows={3}
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={formData.quest_type}
                  onChange={(e) => setFormData({ ...formData, quest_type: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                >
                  <option value="course">Course (structured learning path)</option>
                  <option value="optio">Quest (flexible exploration)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Courses have structured lessons; Quests are more open-ended.
                </p>
              </div>
            </>
          ) : (
            <div className="mb-6">
              <label className="block text-sm font-medium mb-1">Select a Quest</label>
              {loadingQuests ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple"></div>
                </div>
              ) : availableQuests.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 text-sm">No quests available without curriculum</p>
                  <p className="text-gray-400 text-xs mt-1">All available quests already have curriculum</p>
                </div>
              ) : (
                <select
                  value={selectedQuestId}
                  onChange={(e) => setSelectedQuestId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
                  required
                >
                  <option value="">Select a quest...</option>
                  {availableQuests.map(quest => (
                    <option key={quest.id} value={quest.id}>
                      {quest.title} ({quest.quest_type || 'standard'})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium">Draft Mode</p>
                <p className="mt-1">Your curriculum will be saved as a draft. You can add lessons, content, and tasks before publishing it to students.</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (mode === 'existing' && !selectedQuestId)}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Loading...' : mode === 'new' ? 'Create & Build' : 'Build Curriculum'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
