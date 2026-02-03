import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import UnifiedQuestForm from './UnifiedQuestForm';
import CourseQuestForm from './CourseQuestForm';

/**
 * QuestVisibilityManager - Quest availability control for organization admins
 *
 * Handles all three quest_visibility_policy modes:
 * - all_optio: All global quests available by default
 * - curated: Manual grant/revoke of specific quests
 * - private_only: Only org-created quests available
 */
export default function QuestVisibilityManager({ orgId, orgData, onUpdate, siteSettings, refreshKey }) {
  const { user } = useAuth();
  const [quests, setQuests] = useState([]);
  const [accessibleQuestIds, setAccessibleQuestIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'optio', 'course'
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all', 'org', 'optio'
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [editingQuest, setEditingQuest] = useState(null);
  const questsPerPage = 25;

  // Get org name for display
  const orgName = orgData?.organization?.name || 'Organization';

  // Check if user can delete quests
  const isSuperAdmin = user?.role === 'superadmin';

  // Get logo URLs
  const optioLogoUrl = siteSettings?.logo_url;
  const orgLogoUrl = orgData?.organization?.branding_config?.logo_url;

  const policy = orgData?.organization?.quest_visibility_policy || 'all_optio';
  const canToggle = policy === 'curated';
  const showOptioQuests = policy !== 'private_only'; // Don't show Optio quests in private_only mode

  useEffect(() => {
    fetchQuests();
    fetchAccessibleQuests();
  }, [orgId, refreshKey]);

  // Reset to first page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, sourceFilter]);

  // Handle quest deletion
  const handleDeleteQuest = async (questId) => {
    try {
      await api.delete(`/api/admin/quests/${questId}`);
      setQuests(prev => prev.filter(q => q.id !== questId));
      setEditingQuest(null);
      toast.success('Quest deleted successfully');
      onUpdate?.();
    } catch (error) {
      console.error('Failed to delete quest:', error);
      toast.error(error.response?.data?.error || 'Failed to delete quest');
    }
  };

  const fetchQuests = async () => {
    try {
      // Fetch both public quests and org-specific quests in parallel
      const [publicResponse, orgResponse] = await Promise.all([
        // Public quests from admin endpoint
        api.get('/api/admin/quests?per_page=1000&is_active=true&is_public=true'),
        // Org-specific quests (may not be public)
        api.get(`/api/admin/organizations/${orgId}/quests`)
      ]);

      const publicQuests = publicResponse.data.quests || [];
      const orgQuests = orgResponse.data.quests || [];

      // Merge quests, avoiding duplicates (org quests take precedence)
      const questMap = new Map();
      publicQuests.forEach(q => questMap.set(q.id, q));
      orgQuests.forEach(q => questMap.set(q.id, q));

      setQuests(Array.from(questMap.values()));
    } catch (error) {
      console.error('Failed to fetch quests:', error);
    }
  };

  const fetchAccessibleQuests = async () => {
    try {
      const { data } = await api.get(`/api/admin/organizations/${orgId}`);
      const ids = new Set((data.curated_quests || []).map(q => q.quest_id));
      setAccessibleQuestIds(ids);
    } catch (error) {
      console.error('Failed to fetch accessible quests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAvailability = async (questId, currentlyAvailable) => {
    // Optimistic update - update UI immediately
    setAccessibleQuestIds(prev => {
      const newSet = new Set(prev);
      if (currentlyAvailable) {
        newSet.delete(questId);
      } else {
        newSet.add(questId);
      }
      return newSet;
    });

    try {
      if (currentlyAvailable) {
        await api.post(`/api/admin/organizations/${orgId}/quests/revoke`, {
          quest_id: questId
        });
      } else {
        await api.post(`/api/admin/organizations/${orgId}/quests/grant`, {
          quest_id: questId
        });
      }
      // Silent success - UI already updated
    } catch (error) {
      console.error('Failed to toggle quest availability:', error);
      // Revert on failure
      setAccessibleQuestIds(prev => {
        const newSet = new Set(prev);
        if (currentlyAvailable) {
          newSet.add(questId);
        } else {
          newSet.delete(questId);
        }
        return newSet;
      });
      alert(error.response?.data?.error || 'Failed to update quest availability');
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedIds.size === 0) return;

    const actionText = action === 'grant' ? 'make available' : 'make unavailable';
    if (!confirm(`Are you sure you want to ${actionText} ${selectedIds.size} selected quest(s)?`)) {
      return;
    }

    // Optimistic update
    const previousState = new Set(accessibleQuestIds);
    setAccessibleQuestIds(prev => {
      const newSet = new Set(prev);
      selectedIds.forEach(id => {
        if (action === 'grant') {
          newSet.add(id);
        } else {
          newSet.delete(id);
        }
      });
      return newSet;
    });
    setSelectedIds(new Set());

    try {
      const promises = Array.from(selectedIds).map(questId => {
        if (action === 'grant') {
          return api.post(`/api/admin/organizations/${orgId}/quests/grant`, { quest_id: questId });
        } else {
          return api.post(`/api/admin/organizations/${orgId}/quests/revoke`, { quest_id: questId });
        }
      });

      await Promise.all(promises);
    } catch (error) {
      console.error('Failed to perform bulk action:', error);
      // Revert on failure
      setAccessibleQuestIds(previousState);
      alert('Some quests failed to update. Please try again.');
    }
  };

  const handleToggleSelect = (questId) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(questId)) {
      newSelected.delete(questId);
    } else {
      newSelected.add(questId);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === paginatedQuests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedQuests.map(q => q.id)));
    }
  };

  const isQuestAvailable = (questId) => {
    if (policy === 'all_optio') {
      const quest = quests.find(q => q.id === questId);
      return !quest?.organization_id || quest.organization_id === orgId;
    } else if (policy === 'curated') {
      return accessibleQuestIds.has(questId);
    } else if (policy === 'private_only') {
      const quest = quests.find(q => q.id === questId);
      return quest?.organization_id === orgId;
    }
    return false;
  };

  const filteredQuests = quests.filter(quest => {
    const matchesSearch = quest.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quest.description?.toLowerCase().includes(searchTerm.toLowerCase());

    const isOrgQuest = quest.organization_id === orgId;
    const questType = quest.quest_type || 'optio';

    // Type filter
    if (typeFilter !== 'all' && questType !== typeFilter) {
      return false;
    }

    // Source filter
    if (sourceFilter === 'org' && !isOrgQuest) {
      return false;
    }
    if (sourceFilter === 'optio' && isOrgQuest) {
      return false;
    }

    // For private_only: only show org's own quests
    if (policy === 'private_only') {
      return matchesSearch && isOrgQuest;
    }

    // For curated: show Optio quests (not other org quests) for toggling
    if (policy === 'curated') {
      return matchesSearch && (!quest.organization_id || isOrgQuest);
    }

    // For all_optio: show Optio quests and org quests
    return matchesSearch && (!quest.organization_id || isOrgQuest);
  });

  // Pagination
  const totalPages = Math.ceil(filteredQuests.length / questsPerPage);
  const startIndex = (currentPage - 1) * questsPerPage;
  const paginatedQuests = filteredQuests.slice(startIndex, startIndex + questsPerPage);

  // Stats
  const availableCount = filteredQuests.filter(q => isQuestAvailable(q.id)).length;
  const unavailableCount = filteredQuests.length - availableCount;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Stats Bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search quests..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-gray-200 rounded-lg px-4 py-2 w-48 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
            >
              <option value="all">All Types</option>
              <option value="optio">Optio</option>
              <option value="course">Course</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
            >
              <option value="all">All Sources</option>
              <option value="org">{orgName}</option>
              <option value="optio">Optio</option>
            </select>
            {(searchTerm || typeFilter !== 'all' || sourceFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setTypeFilter('all');
                  setSourceFilter('all');
                }}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">
              {filteredQuests.length} quests
            </span>
            <span className="text-green-600 font-medium">
              {availableCount} available
            </span>
            <span className="text-gray-400">
              {unavailableCount} unavailable
            </span>
          </div>
        </div>

        {/* Bulk Actions */}
        {canToggle && selectedIds.size > 0 && (
          <div className="flex gap-3 items-center mt-3 pt-3 border-t border-gray-100">
            <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
            <button
              onClick={() => handleBulkAction('grant')}
              className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              Make Available
            </button>
            <button
              onClick={() => handleBulkAction('revoke')}
              className="px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Make Unavailable
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Quest List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {canToggle && (
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === paginatedQuests.length && paginatedQuests.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Quest</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Type</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Source</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedQuests.length === 0 ? (
              <tr>
                <td colSpan={canToggle ? 5 : 4} className="px-4 py-8 text-center text-gray-500">
                  {searchTerm ? 'No quests match your search' :
                   policy === 'private_only' ? 'No organization quests found. Create quests to see them here.' :
                   'No quests found'}
                </td>
              </tr>
            ) : (
              paginatedQuests.map(quest => {
                const available = isQuestAvailable(quest.id);
                const isOrgQuest = quest.organization_id === orgId;
                const isSelected = selectedIds.has(quest.id);
                const questType = quest.quest_type || 'optio';

                return (
                  <tr
                    key={quest.id}
                    onClick={() => isOrgQuest && setEditingQuest(quest)}
                    className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-optio-purple/5' : ''} ${isOrgQuest ? 'cursor-pointer' : ''}`}
                  >
                    {canToggle && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {!isOrgQuest && policy === 'curated' && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(quest.id)}
                            className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                          />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm">{quest.title}</div>
                      {quest.pillar_primary && (
                        <div className="text-xs text-gray-500 mt-0.5">{quest.pillar_primary}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          questType === 'course'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {questType === 'course' ? 'Course' : 'Optio'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        {isOrgQuest ? (
                          <span className="text-xs font-medium text-gray-600" title={orgName}>{orgName}</span>
                        ) : (
                          optioLogoUrl ? (
                            <img
                              src={optioLogoUrl}
                              alt="Optio"
                              className="h-5 w-auto max-w-[60px] object-contain"
                            />
                          ) : (
                            <span className="text-xs font-semibold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
                              Optio
                            </span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                        {isOrgQuest ? (
                          // Org quests are always available
                          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                            Always
                          </span>
                        ) : policy === 'all_optio' ? (
                          // all_optio: Show locked-on toggle for Optio quests
                          <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-green-500 cursor-not-allowed opacity-75" title="All Optio quests are available">
                            <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm translate-x-6" />
                          </div>
                        ) : canToggle ? (
                          // curated: Show clickable toggle
                          <button
                            onClick={() => handleToggleAvailability(quest.id, available)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-optio-purple focus:ring-offset-2 ${
                              available ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                                available ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        ) : (
                          // Fallback badge
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            available ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {available ? 'Yes' : 'No'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {startIndex + 1} to {Math.min(startIndex + questsPerPage, filteredQuests.length)} of {filteredQuests.length}
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

      {/* Edit Quest Modals */}
      {editingQuest && editingQuest.quest_type === 'course' && (
        <CourseQuestForm
          mode="edit"
          quest={editingQuest}
          organizationId={orgId}
          canDelete={isSuperAdmin || editingQuest.organization_id === orgId}
          onDelete={handleDeleteQuest}
          onClose={() => setEditingQuest(null)}
          onSuccess={(updatedQuest) => {
            setQuests(prev => prev.map(q => q.id === updatedQuest.id ? { ...q, ...updatedQuest } : q));
            setEditingQuest(null);
            onUpdate?.();
          }}
        />
      )}

      {editingQuest && editingQuest.quest_type !== 'course' && (
        <UnifiedQuestForm
          mode="edit"
          quest={editingQuest}
          organizationId={orgId}
          canDelete={isSuperAdmin || editingQuest.organization_id === orgId}
          onDelete={handleDeleteQuest}
          onClose={() => setEditingQuest(null)}
          onSuccess={(updatedQuest) => {
            setQuests(prev => prev.map(q => q.id === updatedQuest.id ? { ...q, ...updatedQuest } : q));
            setEditingQuest(null);
            onUpdate?.();
          }}
        />
      )}
    </div>
  );
}
