import { useState, useEffect } from 'react';
import api from '../../services/api';

export default function BadgeQuestLinker() {
  // State management
  const [mode, setMode] = useState('manual'); // 'manual' or 'ai'
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

  // AI mode state
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(70);
  const [bulkAnalysisResults, setBulkAnalysisResults] = useState(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState(new Set());

  // Load data on mount
  useEffect(() => {
    loadBadges();
    loadAllQuests();
  }, []);

  // Load linked quests when badge is selected
  useEffect(() => {
    if (selectedBadge) {
      loadLinkedQuests();
      setAiSuggestions([]); // Clear AI suggestions when changing badges
      setSelectedSuggestions(new Set());
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
      const response = await api.get('/api/admin/quests?per_page=100');
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

      const questsData = response.data.quests || {};
      const allLinkedQuests = [
        ...(questsData.required || []),
        ...(questsData.optional || [])
      ];

      setLinkedQuests(allLinkedQuests);

      const linkedQuestIds = new Set(allLinkedQuests.map(q => q.id));
      const available = quests.filter(q => !linkedQuestIds.has(q.id));
      setAvailableQuests(available);
    } catch (err) {
      console.error('Error loading linked quests:', err);
      setError('Failed to load linked quests');
    } finally {
      setLoading(false);
    }
  };

  // Manual mode functions
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

  // AI mode functions
  const runAIAnalysis = async () => {
    if (!selectedBadge) return;

    try {
      setAiAnalyzing(true);
      setMessage('');
      setError('');
      setAiSuggestions([]);

      const response = await api.post(`/api/admin/badge-quests/ai-analyze/${selectedBadge.id}`, {
        min_confidence: confidenceThreshold
      });

      const results = response.data.analysis;
      setAiSuggestions(results.recommendations || []);

      setMessage(`AI found ${results.recommendations_count} recommended quests (${results.statistics.high_confidence} high confidence)`);
      setTimeout(() => setMessage(''), 5000);
    } catch (err) {
      console.error('Error running AI analysis:', err);
      setError(err.response?.data?.error || 'AI analysis failed');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const runBulkAIAnalysis = async () => {
    try {
      setAiAnalyzing(true);
      setMessage('');
      setError('');
      setBulkAnalysisResults(null);

      setMessage('Analyzing all badges... This may take 1-2 minutes...');

      const response = await api.post('/api/admin/badge-quests/ai-analyze-all', {
        min_confidence: confidenceThreshold,
        max_per_badge: 15
      });

      const results = response.data.analysis;
      setBulkAnalysisResults(results);

      setMessage(`Analysis complete! Found ${results.total_recommendations} recommendations across ${results.badges_analyzed} badges.`);
    } catch (err) {
      console.error('Error running bulk AI analysis:', err);
      setError(err.response?.data?.error || 'Bulk AI analysis failed');
    } finally {
      setAiAnalyzing(false);
    }
  };

  const autoLinkAllBadges = async () => {
    if (!confirm(`Auto-link ALL AI recommendations across all badges? This will create ${bulkAnalysisResults?.total_recommendations || 0} quest-badge links.`)) {
      return;
    }

    try {
      setLoading(true);
      setMessage('');
      setError('');

      setMessage('Auto-linking quests... Please wait...');

      const response = await api.post('/api/admin/badge-quests/ai-bulk-auto-link', {
        min_confidence: confidenceThreshold,
        max_per_badge: 15,
        dry_run: false
      });

      const results = response.data;
      setMessage(`Success! Created ${results.total_links_created} links across ${results.badges_processed} badges.`);

      // Reload data
      if (selectedBadge) {
        await loadLinkedQuests();
      }
    } catch (err) {
      console.error('Error auto-linking:', err);
      setError(err.response?.data?.error || 'Auto-link failed');
    } finally {
      setLoading(false);
    }
  };

  const applySelectedSuggestions = async () => {
    if (selectedSuggestions.size === 0) {
      setError('No suggestions selected');
      return;
    }

    if (!selectedBadge) return;

    try {
      setLoading(true);
      setMessage('');
      setError('');

      const suggestionsToApply = aiSuggestions.filter(s =>
        selectedSuggestions.has(s.quest_id)
      );

      const response = await api.post(`/api/admin/badge-quests/ai-auto-link/${selectedBadge.id}`, {
        recommendations: suggestionsToApply,
        dry_run: false
      });

      // Check response for detailed results
      const results = response.data.results || response.data;
      const linksCreated = results.links_created || 0;
      const linksFailed = results.links_failed || 0;

      if (linksFailed > 0) {
        // Show partial success/failure message
        const failedDetails = results.failed || [];
        const errorMessages = failedDetails.map(f => `${f.quest_title}: ${f.error}`).join(', ');
        setError(`Linked ${linksCreated} quests, but ${linksFailed} failed: ${errorMessages}`);
      } else {
        setMessage(`Successfully linked ${linksCreated} quests to the badge!`);
      }

      // Clear selections and refresh the linked quests list
      setSelectedSuggestions(new Set());
      await loadLinkedQuests();

      // Clear AI suggestions that were successfully linked
      const failedQuestIds = new Set((results.failed || []).map(f => f.quest_id));
      const remainingSuggestions = aiSuggestions.filter(s =>
        failedQuestIds.has(s.quest_id) || !selectedSuggestions.has(s.quest_id)
      );
      setAiSuggestions(remainingSuggestions);

      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Error applying suggestions:', err);
      const errorMsg = err.response?.data?.error || 'Failed to apply suggestions';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const toggleSuggestion = (questId) => {
    const newSelected = new Set(selectedSuggestions);
    if (newSelected.has(questId)) {
      newSelected.delete(questId);
    } else {
      newSelected.add(questId);
    }
    setSelectedSuggestions(newSelected);
  };

  const getConfidenceBadgeColor = (confidence) => {
    if (confidence >= 85) return 'bg-green-100 text-green-800';
    if (confidence >= 70) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getConfidenceLabel = (confidence) => {
    if (confidence >= 85) return 'High';
    if (confidence >= 70) return 'Medium';
    return 'Low';
  };

  // Filter available quests
  const filteredAvailableQuests = availableQuests.filter(quest => {
    const matchesSearch = quest.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (quest.description || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPillar = pillarFilter === 'all' ||
                         (quest.pillar && quest.pillar.toLowerCase() === pillarFilter.toLowerCase());

    return matchesSearch && matchesPillar;
  });

  const pillars = ['all', 'stem', 'wellness', 'language', 'society', 'creativity'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
          AI-Powered Badge-Quest Linking
        </h2>
        <p className="text-gray-600 mb-6">
          Use AI to automatically suggest and link quests to badges, or manage links manually.
        </p>
      </div>

      {/* Mode Selector */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex gap-4 mb-4">
          <button
            onClick={() => setMode('manual')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              mode === 'manual'
                ? 'bg-gradient-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Manual Mode
          </button>
          <button
            onClick={() => setMode('ai')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              mode === 'ai'
                ? 'bg-gradient-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            AI Automation
          </button>
        </div>
      </div>

      {/* Badge Selection (both modes) */}
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
            <div className="mt-2 text-sm text-gray-600">
              <span className="font-medium">Currently linked:</span> {linkedQuests.length} quests
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

      {/* AI Mode */}
      {mode === 'ai' && (
        <div className="space-y-6">
          {/* AI Controls */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">AI Configuration</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confidence Threshold: {confidenceThreshold}%
                </label>
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>More Results (50%)</span>
                  <span>More Selective (95%)</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={runAIAnalysis}
                  disabled={!selectedBadge || aiAnalyzing}
                  className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
                >
                  {aiAnalyzing ? 'Analyzing...' : 'Analyze Selected Badge'}
                </button>

                <button
                  onClick={runBulkAIAnalysis}
                  disabled={aiAnalyzing}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
                >
                  {aiAnalyzing ? 'Analyzing All...' : 'Analyze All Badges'}
                </button>
              </div>

              {bulkAnalysisResults && (
                <button
                  onClick={autoLinkAllBadges}
                  disabled={loading}
                  className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
                >
                  Auto-Link All Recommendations ({bulkAnalysisResults.total_recommendations} links)
                </button>
              )}
            </div>
          </div>

          {/* AI Suggestions */}
          {selectedBadge && aiSuggestions.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  AI Recommendations ({aiSuggestions.length})
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={runAIAnalysis}
                    disabled={aiAnalyzing || loading}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={applySelectedSuggestions}
                    disabled={selectedSuggestions.size === 0 || loading}
                    className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 text-sm font-medium"
                  >
                    Link Selected ({selectedSuggestions.size})
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {aiSuggestions.map((suggestion) => (
                  <div
                    key={suggestion.quest_id}
                    className={`border rounded-lg p-4 transition-colors ${
                      selectedSuggestions.has(suggestion.quest_id)
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedSuggestions.has(suggestion.quest_id)}
                        onChange={() => toggleSuggestion(suggestion.quest_id)}
                        className="mt-1"
                      />

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-gray-900">
                            {suggestion.quest_title}
                          </h4>
                          <span className={`text-xs px-2 py-1 rounded ${getConfidenceBadgeColor(suggestion.confidence)}`}>
                            {getConfidenceLabel(suggestion.confidence)} ({suggestion.confidence}%)
                          </span>
                        </div>

                        <p className="text-sm text-gray-600 mb-2">
                          {suggestion.reasoning}
                        </p>

                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>Pillar Match: {suggestion.pillar_alignment}%</span>
                          <span>Skill Match: {suggestion.skill_match}%</span>
                          <span>XP: {suggestion.total_xp}</span>
                          <span>Tasks: {suggestion.task_count}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bulk Analysis Results */}
          {bulkAnalysisResults && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">
                Bulk Analysis Results
              </h3>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {bulkAnalysisResults.badges_analyzed}
                  </div>
                  <div className="text-sm text-gray-600">Badges Analyzed</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {bulkAnalysisResults.total_recommendations}
                  </div>
                  <div className="text-sm text-gray-600">Total Recommendations</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {Math.round(bulkAnalysisResults.total_recommendations / bulkAnalysisResults.badges_analyzed)}
                  </div>
                  <div className="text-sm text-gray-600">Avg per Badge</div>
                </div>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {bulkAnalysisResults.badge_results.map((result) => (
                  <div key={result.badge_id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">{result.badge_name}</h4>
                        <p className="text-sm text-gray-600">
                          {result.recommendations_count} recommendations found
                        </p>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        <div>High: {result.statistics?.high_confidence || 0}</div>
                        <div>Med: {result.statistics?.medium_confidence || 0}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Mode */}
      {mode === 'manual' && selectedBadge && (
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
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
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
                        onClick={() => linkQuest(quest.id, false)}
                        disabled={loading}
                        className="ml-3 px-3 py-1 bg-gradient-primary text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50"
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
