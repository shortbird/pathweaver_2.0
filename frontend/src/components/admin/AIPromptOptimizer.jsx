import React, { useState, useEffect } from 'react';
import api from '../../services/api';

const AIPromptOptimizer = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState(null);
  const [promptAnalysis, setPromptAnalysis] = useState([]);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    loadInsights();
  }, [days]);

  const loadInsights = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/v3/admin/ai-optimizer/insights?days=${days}`);
      setInsights(response.data.data);
    } catch (error) {
      console.error('Error loading insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPromptAnalysis = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/v3/admin/ai-optimizer/analyze?days=${days}`);
      setPromptAnalysis(response.data.data);
    } catch (error) {
      console.error('Error loading prompt analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestions = async (versionNumber) => {
    try {
      setLoading(true);
      const response = await api.get(`/api/v3/admin/ai-optimizer/suggestions/${versionNumber}`);
      setSuggestions(response.data.data);
      setSelectedPrompt(versionNumber);
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const createOptimizedVersion = async (baseVersion, modifications) => {
    try {
      setLoading(true);
      const response = await api.post('/api/v3/admin/ai-optimizer/create-optimized', {
        base_version: baseVersion,
        modifications: modifications
      });
      alert(`New optimized version created: ${response.data.data.version_number}`);
      loadInsights();
    } catch (error) {
      console.error('Error creating optimized version:', error);
      alert('Error creating optimized version');
    } finally {
      setLoading(false);
    }
  };

  const getPerformanceColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSeverityColor = (severity) => {
    if (severity === 'high') return 'bg-red-100 text-red-800';
    if (severity === 'medium') return 'bg-yellow-100 text-yellow-800';
    return 'bg-blue-100 text-blue-800';
  };

  const getTrendIcon = (direction) => {
    if (direction === 'improving') return '📈';
    if (direction === 'declining') return '📉';
    return '➡️';
  };

  const renderOverview = () => {
    if (!insights) return <div>Loading...</div>;

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Total Prompts</div>
            <div className="text-3xl font-bold">{insights.summary.total_prompts}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Active Prompts</div>
            <div className="text-3xl font-bold">{insights.summary.active_prompts}</div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Need Optimization</div>
            <div className="text-3xl font-bold text-red-600">
              {insights.summary.prompts_needing_optimization}
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600">Avg Performance</div>
            <div className={`text-3xl font-bold ${getPerformanceColor(insights.summary.avg_performance_score)}`}>
              {insights.summary.avg_performance_score.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Quality Trends */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Quality Trends</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{getTrendIcon(insights.quality_trends.trend_direction)}</span>
                <span className="font-semibold capitalize">{insights.quality_trends.trend_direction}</span>
              </div>
              <div className="text-sm text-gray-600">
                Quality Score Change: <span className={insights.quality_trends.quality_change > 0 ? 'text-green-600' : 'text-red-600'}>
                  {insights.quality_trends.quality_change > 0 ? '+' : ''}{insights.quality_trends.quality_change.toFixed(2)}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                Approval Rate Change: <span className={insights.quality_trends.approval_change > 0 ? 'text-green-600' : 'text-red-600'}>
                  {insights.quality_trends.approval_change > 0 ? '+' : ''}{insights.quality_trends.approval_change.toFixed(2)}%
                </span>
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600">
                First Period Quality: {insights.quality_trends.first_period_quality.toFixed(2)}/10
              </div>
              <div className="text-sm text-gray-600">
                Second Period Quality: {insights.quality_trends.second_period_quality.toFixed(2)}/10
              </div>
            </div>
          </div>
        </div>

        {/* Best and Worst Prompts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Best Prompt */}
          {insights.best_prompt && (
            <div className="bg-green-50 p-6 rounded-lg border border-green-200">
              <h3 className="text-lg font-semibold mb-4 text-green-800">Best Performing Prompt</h3>
              <div className="space-y-2">
                <div className="font-mono text-sm">{insights.best_prompt.version_number}</div>
                <div className="text-3xl font-bold text-green-600">
                  {insights.best_prompt.performance_score.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">
                  {insights.best_prompt.metrics.total_generations} generations
                </div>
                <div className="text-sm text-gray-600">
                  Quality: {insights.best_prompt.metrics.avg_quality_score.toFixed(1)}/10
                </div>
                <div className="text-sm text-gray-600">
                  Approval: {insights.best_prompt.metrics.avg_approval_rate.toFixed(1)}%
                </div>
              </div>
            </div>
          )}

          {/* Worst Prompt */}
          {insights.worst_prompt && (
            <div className="bg-red-50 p-6 rounded-lg border border-red-200">
              <h3 className="text-lg font-semibold mb-4 text-red-800">Needs Most Improvement</h3>
              <div className="space-y-2">
                <div className="font-mono text-sm">{insights.worst_prompt.version_number}</div>
                <div className="text-3xl font-bold text-red-600">
                  {insights.worst_prompt.performance_score.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">
                  {insights.worst_prompt.metrics.total_generations} generations
                </div>
                <div className="text-sm text-gray-600">
                  Quality: {insights.worst_prompt.metrics.avg_quality_score.toFixed(1)}/10
                </div>
                <div className="text-sm text-gray-600">
                  Approval: {insights.worst_prompt.metrics.avg_approval_rate.toFixed(1)}%
                </div>
                <button
                  onClick={() => {
                    loadSuggestions(insights.worst_prompt.version_number);
                    setActiveTab('suggestions');
                  }}
                  className="mt-4 px-4 py-2 bg-gradient-to-r bg-gradient-primary-reverse text-white rounded hover:opacity-90"
                >
                  View Suggestions
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Recommendations by Category */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Recommendations by Category</h3>
          <div className="space-y-4">
            {Object.entries(insights.recommendations_by_category).map(([category, recs]) => (
              <div key={category} className="border-l-4 border-blue-500 pl-4">
                <div className="font-semibold capitalize mb-2">
                  {category} ({recs.length} issues)
                </div>
                <div className="space-y-2">
                  {recs.slice(0, 3).map((rec, idx) => (
                    <div key={idx} className="text-sm">
                      <span className={`inline-block px-2 py-1 rounded text-xs mr-2 ${getSeverityColor(rec.severity)}`}>
                        {rec.severity}
                      </span>
                      <span className="text-gray-700">{rec.suggestion}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderPromptAnalysis = () => {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Prompt Version Analysis</h3>
          <button
            onClick={loadPromptAnalysis}
            disabled={loading}
            className="px-4 py-2 bg-gradient-to-r bg-gradient-primary-reverse text-white rounded hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh Analysis'}
          </button>
        </div>

        <div className="space-y-4">
          {promptAnalysis.map((prompt) => (
            <div key={prompt.version_number} className="bg-white p-6 rounded-lg shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="font-mono text-sm mb-1">{prompt.version_number}</div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-xs ${prompt.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {prompt.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {prompt.needs_optimization && (
                      <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800">
                        Needs Optimization
                      </span>
                    )}
                  </div>
                </div>
                <div className={`text-3xl font-bold ${getPerformanceColor(prompt.performance_score)}`}>
                  {prompt.performance_score.toFixed(1)}%
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-xs text-gray-600">Generations</div>
                  <div className="text-lg font-semibold">{prompt.metrics.total_generations}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Quality Score</div>
                  <div className="text-lg font-semibold">{prompt.metrics.avg_quality_score.toFixed(1)}/10</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Approval Rate</div>
                  <div className="text-lg font-semibold">{prompt.metrics.avg_approval_rate.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Completion Rate</div>
                  <div className="text-lg font-semibold">{(prompt.metrics.avg_completion_rate * 100).toFixed(1)}%</div>
                </div>
              </div>

              {prompt.recommendations.length > 0 && (
                <div className="border-t pt-4">
                  <div className="text-sm font-semibold mb-2">Recommendations:</div>
                  <div className="space-y-2">
                    {prompt.recommendations.map((rec, idx) => (
                      <div key={idx} className="text-sm">
                        <span className={`inline-block px-2 py-1 rounded text-xs mr-2 ${getSeverityColor(rec.severity)}`}>
                          {rec.severity}
                        </span>
                        <span className="text-gray-700">{rec.suggestion}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    loadSuggestions(prompt.version_number);
                    setActiveTab('suggestions');
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  View Detailed Suggestions
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSuggestions = () => {
    if (!suggestions) {
      return <div className="text-center py-8 text-gray-600">Select a prompt version to view suggestions</div>;
    }

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Suggestions for {suggestions.version_number}</h3>

          <div className={`inline-block px-3 py-1 rounded text-sm mb-4 ${
            suggestions.priority === 'high' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            Priority: {suggestions.priority}
          </div>

          {/* Current Performance */}
          <div className="mb-6">
            <h4 className="font-semibold mb-2">Current Performance</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-gray-600">Total Generations</div>
                <div className="text-lg font-semibold">{suggestions.current_performance.total_generations}</div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Approval Rate</div>
                <div className="text-lg font-semibold">{suggestions.current_performance.avg_approval_rate.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-xs text-gray-600">Quality Score</div>
                <div className="text-lg font-semibold">{suggestions.current_performance.avg_quality_score.toFixed(1)}/10</div>
              </div>
            </div>
          </div>

          {/* Common Issues */}
          <div className="mb-6">
            <h4 className="font-semibold mb-2">Common Issues in Rejected Quests</h4>
            <div className="space-y-2">
              {Object.entries(suggestions.common_issues).map(([issue, percentage]) => (
                <div key={issue} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="text-sm capitalize">{issue.replace(/_/g, ' ')}</div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r bg-gradient-primary-reverse h-2 rounded-full"
                        style={{ width: `${percentage * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{(percentage * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Specific Suggestions */}
          <div className="mb-6">
            <h4 className="font-semibold mb-2">Specific Modifications</h4>
            <div className="space-y-3">
              {suggestions.suggestions.map((suggestion, idx) => (
                <div key={idx} className="border-l-4 border-blue-500 pl-4 py-2">
                  <div className="font-semibold capitalize text-sm mb-1">{suggestion.type}</div>
                  <div className="text-sm text-gray-700 mb-1">{suggestion.description}</div>
                  <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded font-mono">
                    {suggestion.example}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => createOptimizedVersion(
              suggestions.version_number,
              suggestions.suggestions.map(s => s.description)
            )}
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r bg-gradient-primary-reverse text-white rounded hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Optimized Version'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">AI Prompt Optimizer</h2>
        <p className="text-gray-600">Continuous improvement through performance analysis</p>
      </div>

      {/* Time Period Selector */}
      <div className="mb-6 flex items-center gap-4">
        <label className="text-sm font-semibold">Analysis Period:</label>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="px-3 py-2 border rounded"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 font-semibold ${
              activeTab === 'overview'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => {
              setActiveTab('analysis');
              loadPromptAnalysis();
            }}
            className={`px-4 py-2 font-semibold ${
              activeTab === 'analysis'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Prompt Analysis
          </button>
          <button
            onClick={() => setActiveTab('suggestions')}
            className={`px-4 py-2 font-semibold ${
              activeTab === 'suggestions'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Detailed Suggestions
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {loading && activeTab === 'overview' ? (
        <div className="text-center py-8">Loading insights...</div>
      ) : (
        <>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'analysis' && renderPromptAnalysis()}
          {activeTab === 'suggestions' && renderSuggestions()}
        </>
      )}
    </div>
  );
};

export default AIPromptOptimizer;
