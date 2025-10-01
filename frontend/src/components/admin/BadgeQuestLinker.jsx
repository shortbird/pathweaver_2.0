import { useState, useEffect } from 'react';
import api from '../../services/api';

export default function BadgeQuestLinker() {
  const [badges, setBadges] = useState([]);
  const [quests, setQuests] = useState([]);
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [linkedQuests, setLinkedQuests] = useState([]);
  const [availableQuests, setAvailableQuests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pillarFilter, setPillarFilter] = useState('all');

  // Load badges on mount
  useEffect(() => {
    loadBadges();
    loadAllQuests();
  }, []);

  // Load linked quests when badge is selected
  useEffect(() => {
    if (selectedBadge) {
      loadLinkedQuests();
    }
  }, [selectedBadge]);

  const loadBadges = async () => {
    try {
      const response = await api.get('/api/badges');
      setBadges(response.data.badges || []);
    } catch (err) {
      console.error('Error loading badges:', err);
      setError('Failed to load badges');
    }
  };

  const loadAllQuests = async () => {
    try {
      const response = await api.get('/api/v3/admin/quests?per_page=100');
      setQuests(response.data.quests || []);
    } catch (err) {
      console.error('Error loading quests:', err);
      setError('Failed to load quests');
    }
  };

  const loadLinkedQuests = async () => {
    if (!selectedBadge) return;

    try {
      setLoading(true);
      const response = await api.get(`/api/badges/${selectedBadge.id}/quests`);
      setLinkedQuests(response.data.quests || []);

      // Calculate available quests (not yet linked)
      const linkedQuestIds = new Set(
        (response.data.quests || []).map(q => q.id)
      );
      const available = quests.filter(q => !linkedQuestIds.has(q.id));
      setAvailableQuests(available);
    } catch (err) {
      console.error('Error loading linked quests:', err);
      setError('Failed to load linked quests');
    } finally {
      setLoading(false);
    }
  };

  const linkQuest = async (questId, isRequired = true) => {
    if (!selectedBadge) return;

    try {
      setLoading(true);
      setMessage('');
      setError('');

      await api.post(`/api/badges/admin/${selectedBadge.id}/quests`, {
        quest_id: questId,
        is_required: isRequired,
        order_index: linkedQuests.length + 1
      });

      setMessage('Quest linked successfully!');
      await loadLinkedQuests();

      // Clear message after 3 seconds
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error linking quest:', err);
      setError(err.response?.data?.error || 'Failed to link quest');
    } finally {
      setLoading(false);
    }
  };

  const unlinkQuest = async (questId) => {
    if (!selectedBadge) return;

    if (!confirm('Are you sure you want to unlink this quest from the badge?')) {
      return;
    }

    try {
      setLoading(true);
      setMessage('');
      setError('');

      await api.delete(`/api/badges/admin/${selectedBadge.id}/quests/${questId}`);

      setMessage('Quest unlinked successfully!');
      await loadLinkedQuests();

      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error unlinking quest:', err);
      setError(err.response?.data?.error || 'Failed to unlink quest');
    } finally {
      setLoading(false);
    }
  };

  // Filter available quests by search and pillar
  const filteredAvailableQuests = availableQuests.filter(quest => {
    const matchesSearch = quest.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (quest.description || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPillar = pillarFilter === 'all' ||
                         (quest.pillar && quest.pillar.toLowerCase() === pillarFilter.toLowerCase());

    return matchesSearch && matchesPillar;
  });

  const pillars = [
    'all',
    'stem',
    'wellness',
    'language',
    'society',
    'creativity'
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent mb-4">
          Link Quests to Badges
        </h2>
        <p className="text-gray-600 mb-6">
          Associate quests with badges to create learning paths. Students earn badges by completing linked quests.
        </p>
      </div>

      {/* Badge Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Badge
        </label>
        <select
          value={selectedBadge?.id || ''}
          onChange={(e) => {
            const badge = badges.find(b => b.id === e.target.value);
            setSelectedBadge(badge || null);
          }}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        >
          <option value="">Choose a badge...</option>
          {badges.map(badge => (
            <option key={badge.id} value={badge.id}>
              {badge.name} ({badge.pillar_primary})
            </option>
          ))}
        </select>

        {selectedBadge && (
          <div className="mt-4 p-4 bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg">
            <h3 className="font-semibold text-lg">{selectedBadge.name}</h3>
            <p className="text-sm text-gray-700 italic mt-1">
              {selectedBadge.identity_statement}
            </p>
            <div className="mt-2 text-sm text-gray-600">
              <span className="font-medium">Requirements:</span> {selectedBadge.min_quests} quests, {selectedBadge.min_xp} XP
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      {message && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          {message}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {selectedBadge && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Linked Quests */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center justify-between">
              <span>Linked Quests ({linkedQuests.length})</span>
              <span className="text-sm text-gray-500">Required: {selectedBadge.min_quests}</span>
            </h3>

            {loading && linkedQuests.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Loading...</p>
            ) : linkedQuests.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No quests linked yet. Select quests from the available list to add them.
              </p>
            ) : (
              <div className="space-y-3">
                {linkedQuests.map((quest, index) => (
                  <div
                    key={quest.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-500">#{index + 1}</span>
                          <h4 className="font-medium text-gray-900">{quest.title}</h4>
                        </div>
                        {quest.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {quest.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          {quest.pillar && (
                            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
                              {quest.pillar}
                            </span>
                          )}
                          {quest.source && (
                            <span className="text-xs text-gray-500">{quest.source}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => unlinkQuest(quest.id)}
                        disabled={loading}
                        className="ml-3 text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available Quests */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">
              Available Quests ({filteredAvailableQuests.length})
            </h3>

            {/* Search and Filters */}
            <div className="space-y-3 mb-4">
              <input
                type="text"
                placeholder="Search quests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />

              <select
                value={pillarFilter}
                onChange={(e) => setPillarFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                {pillars.map(pillar => (
                  <option key={pillar} value={pillar}>
                    {pillar === 'all' ? 'All Pillars' : pillar.charAt(0).toUpperCase() + pillar.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredAvailableQuests.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  {searchTerm || pillarFilter !== 'all'
                    ? 'No quests match your filters'
                    : 'All quests are linked to this badge'}
                </p>
              ) : (
                filteredAvailableQuests.map(quest => (
                  <div
                    key={quest.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{quest.title}</h4>
                        {quest.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {quest.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2">
                          {quest.pillar && (
                            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
                              {quest.pillar}
                            </span>
                          )}
                          {quest.source && (
                            <span className="text-xs text-gray-500">{quest.source}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => linkQuest(quest.id, true)}
                        disabled={loading}
                        className="ml-3 px-3 py-1 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
