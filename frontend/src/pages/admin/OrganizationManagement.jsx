import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';

export default function OrganizationManagement() {
  const { orgId } = useParams();
  const [orgData, setOrgData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchOrganizationData();
  }, [orgId]);

  const fetchOrganizationData = async () => {
    try {
      const { data } = await api.get(`/api/admin/organizations/organizations/${orgId}`);
      setOrgData(data);
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!orgData) {
    return <div className="p-8">Organization not found</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">{orgData.organization.name}</h1>

      <div className="mb-6 border-b">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 ${activeTab === 'overview' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 ${activeTab === 'users' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab('quests')}
            className={`px-4 py-2 ${activeTab === 'quests' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Quests
          </button>
          {orgData.organization.quest_visibility_policy === 'curated' && (
            <button
              onClick={() => setActiveTab('curation')}
              className={`px-4 py-2 ${activeTab === 'curation' ? 'border-b-2 border-optio-purple' : ''}`}
            >
              Quest Curation
            </button>
          )}
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 ${activeTab === 'analytics' ? 'border-b-2 border-optio-purple' : ''}`}
          >
            Analytics
          </button>
        </nav>
      </div>

      {activeTab === 'overview' && <OverviewTab orgData={orgData} />}
      {activeTab === 'users' && <UsersTab users={orgData.users} />}
      {activeTab === 'quests' && <QuestsTab quests={orgData.organization_quests} />}
      {activeTab === 'curation' && <CurationTab orgId={orgId} curatedQuests={orgData.curated_quests} onUpdate={fetchOrganizationData} />}
      {activeTab === 'analytics' && <AnalyticsTab analytics={orgData.analytics} />}
    </div>
  );
}

function OverviewTab({ orgData }) {
  const policyLabels = {
    all_optio: 'All Optio Quests + Org Quests',
    curated: 'Curated Quests + Org Quests',
    private_only: 'Organization Quests Only'
  };

  return (
    <div className="grid gap-6">
      <div className="bg-white rounded-lg p-6 shadow">
        <h2 className="text-xl font-bold mb-4">Organization Details</h2>
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

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total Users</h3>
          <p className="text-3xl font-bold">{orgData.analytics.total_users}</p>
        </div>
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Quest Completions</h3>
          <p className="text-3xl font-bold">{orgData.analytics.total_completions}</p>
        </div>
        <div className="bg-white rounded-lg p-6 shadow">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Total XP Earned</h3>
          <p className="text-3xl font-bold">{orgData.analytics.total_xp.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

function UsersTab({ users }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">XP</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Org Admin</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {users.map(user => (
            <tr key={user.id}>
              <td className="px-6 py-4">{user.display_name}</td>
              <td className="px-6 py-4">{user.email}</td>
              <td className="px-6 py-4">{user.role}</td>
              <td className="px-6 py-4">{user.total_xp.toLocaleString()}</td>
              <td className="px-6 py-4">
                {user.is_org_admin ? (
                  <span className="text-green-600">Yes</span>
                ) : (
                  <span className="text-gray-400">No</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuestsTab({ quests }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pillar</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {quests.map(quest => (
            <tr key={quest.id}>
              <td className="px-6 py-4">{quest.title}</td>
              <td className="px-6 py-4">{quest.quest_type}</td>
              <td className="px-6 py-4">{quest.pillar_primary}</td>
              <td className="px-6 py-4">
                {quest.is_active ? (
                  <span className="text-green-600">Active</span>
                ) : (
                  <span className="text-gray-400">Inactive</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CurationTab({ orgId, curatedQuests, onUpdate }) {
  const [showAddModal, setShowAddModal] = useState(false);

  const handleRevoke = async (questId) => {
    if (!confirm('Remove this quest from your curated library?')) return;

    try {
      await api.post(`/api/admin/organizations/organizations/${orgId}/quests/revoke`, {
        quest_id: questId
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to revoke quest access:', error);
      alert('Failed to revoke quest access');
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-bold">Curated Quests</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded"
        >
          Add Quest
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pillar</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Granted At</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {curatedQuests.map(item => (
              <tr key={item.quest_id}>
                <td className="px-6 py-4">{item.quests.title}</td>
                <td className="px-6 py-4">{item.quests.pillar_primary}</td>
                <td className="px-6 py-4">{new Date(item.granted_at).toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleRevoke(item.quest_id)}
                    className="text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <AddQuestModal
          orgId={orgId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            onUpdate();
          }}
        />
      )}
    </div>
  );
}

function AddQuestModal({ orgId, onClose, onSuccess }) {
  const [globalQuests, setGlobalQuests] = useState([]);
  const [selectedQuest, setSelectedQuest] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGlobalQuests();
  }, []);

  const fetchGlobalQuests = async () => {
    try {
      const { data } = await api.get('/api/quests?limit=100');
      const global = data.quests.filter(q => !q.organization_id);
      setGlobalQuests(global);
    } catch (error) {
      console.error('Failed to fetch quests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.post(`/api/admin/organizations/organizations/${orgId}/quests/grant`, {
        quest_id: selectedQuest
      });
      onSuccess();
    } catch (error) {
      console.error('Failed to grant quest access:', error);
      alert(error.response?.data?.error || 'Failed to grant quest access');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Add Quest to Library</h2>

        {loading ? (
          <p>Loading quests...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Select Global Optio Quest</label>
              <select
                value={selectedQuest}
                onChange={(e) => setSelectedQuest(e.target.value)}
                className="w-full border rounded px-3 py-2"
                required
              >
                <option value="">Choose a quest...</option>
                {globalQuests.map(quest => (
                  <option key={quest.id} value={quest.id}>
                    {quest.title} ({quest.pillar_primary})
                  </option>
                ))}
              </select>
            </div>

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
                className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded"
              >
                Add Quest
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AnalyticsTab({ analytics }) {
  return (
    <div className="grid gap-4">
      <div className="bg-white rounded-lg p-6 shadow">
        <h3 className="text-lg font-bold mb-4">Organization Analytics</h3>
        <dl className="grid grid-cols-3 gap-4">
          <div>
            <dt className="text-sm text-gray-600">Total Users</dt>
            <dd className="text-2xl font-bold">{analytics.total_users}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Total Completions</dt>
            <dd className="text-2xl font-bold">{analytics.total_completions}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-600">Total XP Earned</dt>
            <dd className="text-2xl font-bold">{analytics.total_xp.toLocaleString()}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
