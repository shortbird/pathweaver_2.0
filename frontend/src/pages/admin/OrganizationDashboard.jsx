import React, { useState, useEffect } from 'react';
import api from '../../services/api';

export default function OrganizationDashboard() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const { data } = await api.get('/api/admin/organizations/organizations');
      setOrganizations(data.organizations);
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading organizations...</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Organizations</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg"
        >
          Create Organization
        </button>
      </div>

      <div className="grid gap-4">
        {organizations.map(org => (
          <OrganizationCard key={org.id} organization={org} onUpdate={fetchOrganizations} />
        ))}
      </div>

      {showCreateModal && (
        <CreateOrganizationModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchOrganizations();
          }}
        />
      )}
    </div>
  );
}

function OrganizationCard({ organization, onUpdate }) {
  const policyLabels = {
    all_optio: 'All Optio Quests',
    curated: 'Curated Quests',
    private_only: 'Private Only'
  };

  return (
    <div className="border rounded-lg p-6 bg-white shadow-sm">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-bold">{organization.name}</h3>
          <p className="text-gray-600">Slug: {organization.slug}</p>
          <p className="text-sm text-gray-500 mt-2">
            Policy: {policyLabels[organization.quest_visibility_policy]}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/admin/organizations/${organization.id}`}
            className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
          >
            Manage
          </a>
        </div>
      </div>
    </div>
  );
}

function CreateOrganizationModal({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    quest_visibility_policy: 'all_optio'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.post('/api/admin/organizations/organizations', formData);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Create Organization</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
              className="w-full border rounded px-3 py-2"
              pattern="[a-z0-9-]+"
              required
            />
            <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, hyphens only</p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Quest Visibility Policy</label>
            <select
              value={formData.quest_visibility_policy}
              onChange={(e) => setFormData({ ...formData, quest_visibility_policy: e.target.value })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="all_optio">All Optio Quests + Org Quests</option>
              <option value="curated">Curated Quests + Org Quests</option>
              <option value="private_only">Organization Quests Only</option>
            </select>
          </div>

          {error && (
            <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
