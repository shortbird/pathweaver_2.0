import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { PageLoader } from '../../components/ui/Spinner';

export default function OrganizationDashboard() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const fetchOrganizations = useCallback(async () => {
    try {
      const { data } = await api.get(
        `/api/admin/organizations${showArchived ? '?include_archived=true' : ''}`
      );
      setOrganizations(data.organizations);
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  if (loading) {
    return <PageLoader label="Loading organizations" />;
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <h1 className="text-3xl font-bold">Organizations</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show archived
          </label>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
          >
            Create Organization
          </button>
        </div>
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
  const [savingSis, setSavingSis] = useState(false);
  const [action, setAction] = useState(null); // 'archive' | 'delete'
  const [restoring, setRestoring] = useState(false);
  const sisEnabled = Boolean(organization.feature_flags?.sis_enabled);
  // Orgs created before archiving existed have no is_active in the payload;
  // only an explicit false means archived.
  const isArchived = organization.is_active === false;

  const policyLabels = {
    all_optio: 'All Optio Quests',
    curated: 'Curated Quests',
    private_only: 'Private Only'
  };

  const handleToggleSis = async () => {
    setSavingSis(true);
    try {
      await api.put(`/api/admin/organizations/${organization.id}`, {
        feature_flags: { ...(organization.feature_flags || {}), sis_enabled: !sisEnabled }
      });
      onUpdate();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update SIS access');
    } finally {
      setSavingSis(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await api.post(`/api/admin/organizations/${organization.id}/restore`, {});
      onUpdate();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to restore organization');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-6 ${
      isArchived ? 'border-gray-300 bg-gray-50' : 'border-gray-200'
    }`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold">{organization.name}</h3>
            {isArchived && (
              <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                Archived
              </span>
            )}
          </div>
          <p className="text-gray-600">Slug: {organization.slug}</p>
          <p className="text-sm text-gray-500 mt-2">
            Policy: {policyLabels[organization.quest_visibility_policy]}
          </p>
          {isArchived ? (
            <p className="text-sm text-gray-500 mt-2">
              {organization.archived_at
                ? `Archived ${new Date(organization.archived_at).toLocaleDateString()}. `
                : ''}
              Members are standalone platform accounts and kept all their work.
            </p>
          ) : (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleToggleSis}
                disabled={savingSis}
                role="switch"
                aria-checked={sisEnabled}
                aria-label={`Enable SIS for ${organization.name}`}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  sisEnabled ? 'bg-optio-purple' : 'bg-gray-300'
                } ${savingSis ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    sisEnabled ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-700">Enable SIS</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {isArchived ? (
            <>
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="btn-quiet px-3 py-1.5"
              >
                {restoring ? 'Restoring...' : 'Restore'}
              </button>
              <button
                onClick={() => setAction('delete')}
                className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-sm font-medium"
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <a
                href={`/admin/organizations/${organization.id}`}
                className="btn-quiet px-3 py-1.5"
              >
                Manage
              </a>
              <button
                onClick={() => setAction('archive')}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
                aria-label={`Archive ${organization.name}`}
              >
                Archive
              </button>
            </>
          )}
        </div>
      </div>

      {action === 'archive' && (
        <ArchiveOrganizationModal
          organization={organization}
          onClose={() => setAction(null)}
          onSuccess={() => { setAction(null); onUpdate(); }}
        />
      )}
      {action === 'delete' && (
        <DeleteOrganizationModal
          organization={organization}
          onClose={() => setAction(null)}
          onSuccess={() => { setAction(null); onUpdate(); }}
        />
      )}
    </div>
  );
}

function ArchiveOrganizationModal({ organization, onClose, onSuccess }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleArchive = async () => {
    setLoading(true);
    setError('');
    try {
      await api.post(`/api/admin/organizations/${organization.id}/archive`, {});
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to archive organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Archive {organization.name}?</h2>

        <div className="text-sm text-gray-700 space-y-2 mb-4">
          <p>Everyone in this organization becomes a standalone platform account. They keep all of their work: XP, quests, completed tasks, evidence and journal entries.</p>
          <p>Staff roles have no platform equivalent, so org admins and campus coordinators come back as students. Promote those accounts afterwards if you need to.</p>
          <p>The organization disappears from every list and picker. You can restore it later, but members are not re-added automatically.</p>
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">{error}</div>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-quiet">Cancel</button>
          <button
            type="button"
            onClick={handleArchive}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50 font-medium"
          >
            {loading ? 'Archiving...' : 'Archive organization'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteOrganizationModal({ organization, onClose, onSuccess }) {
  const [preview, setPreview] = useState(null);
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(
          `/api/admin/organizations/${organization.id}/deletion-preview`
        );
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to check what still references this organization');
      }
    })();
    return () => { cancelled = true; };
  }, [organization.id]);

  const blockers = preview?.blockers || [];
  const nameMatches = confirmName.trim() === organization.name;
  const canDelete = Boolean(preview?.can_delete) && nameMatches && !loading;

  const handleDelete = async () => {
    setLoading(true);
    setError('');
    try {
      await api.delete(`/api/admin/organizations/${organization.id}`, {
        data: { confirm_name: confirmName.trim() }
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete organization');
      if (err.response?.data?.blockers) {
        setPreview(p => ({ ...(p || {}), blockers: err.response.data.blockers, can_delete: false }));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-2">Delete {organization.name}?</h2>
        <p className="text-sm text-gray-700 mb-4">
          This permanently removes the organization. It cannot be undone.
        </p>

        {!preview && !error && (
          <p className="text-sm text-gray-500 mb-4">Checking what still references this organization...</p>
        )}

        {blockers.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm font-semibold text-amber-900 mb-2">
              Still in use. Clear these out first:
            </p>
            <ul className="text-sm text-amber-900 space-y-0.5 max-h-48 overflow-y-auto">
              {blockers.map(b => (
                <li key={b.table} className="flex justify-between gap-4">
                  <span className="font-mono text-xs">{b.table}</span>
                  <span>{b.rows}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {preview && !preview.can_delete && blockers.length === 0 && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
            {(preview.reasons || []).join(' ')}
          </div>
        )}

        {preview?.can_delete && (
          <div className="mb-4">
            <label htmlFor="confirm-org-name" className="block text-sm font-medium mb-1">
              Type <span className="font-semibold">{organization.name}</span> to confirm
            </label>
            <input
              id="confirm-org-name"
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="input-field px-3 py-2"
              autoComplete="off"
            />
          </div>
        )}

        {error && (
          <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">{error}</div>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-quiet">Cancel</button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Deleting...' : 'Delete permanently'}
          </button>
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
      await api.post('/api/admin/organizations', formData);
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
              className="input-field px-3 py-2"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
              className="input-field px-3 py-2"
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
              className="input-field px-3 py-2"
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
              className="btn-quiet"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
