import { useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function AIContentPipeline() {
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [performanceResult, setPerformanceResult] = useState(null);
  const [qualityReport, setQualityReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [jobHistory, setJobHistory] = useState(null);

  const analyzeAllQuests = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/admin/quests/analyze-all');
      setAnalysisResult(response.data);
      toast.success('Quest analysis complete');
    } catch (error) {
      console.error('Analysis error:', error);
      const errorMsg = error.response?.data?.error?.message || error.response?.data?.error || error.message || 'Failed to analyze quests';
      toast.error(errorMsg);
      setAnalysisResult(null);
    } finally {
      setLoading(false);
    }
  };

  const updateMetrics = async () => {
    setLoading(true);
    try {
      const response = await api.post('/api/admin/metrics/update', {});
      toast.success(`Updated ${response.data.updated_count} quest metrics`);
    } catch (error) {
      console.error('Metrics error:', error);
      const errorMsg = error.response?.data?.error?.message || error.response?.data?.error || error.message || 'Failed to update metrics';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const getQualityReport = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/admin/quality/report?days=30');
      setQualityReport(response.data);
      toast.success('Quality report generated');
    } catch (error) {
      console.error('Quality report error:', error);
      const errorMsg = error.response?.data?.error?.message || error.response?.data?.error || error.message || 'Failed to generate report';
      toast.error(errorMsg);
      setQualityReport(null);
    } finally {
      setLoading(false);
    }
  };

  const getMonthlyReport = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/admin/reports/monthly');
      setMonthlyReport(response.data);
      toast.success('Monthly report generated');
    } catch (error) {
      console.error('Monthly report error:', error);
      const errorMsg = error.response?.data?.error?.message || error.response?.data?.error || error.message || 'Failed to generate report';
      toast.error(errorMsg);
      setMonthlyReport(null);
    } finally {
      setLoading(false);
    }
  };

  const getJobHistory = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/admin/jobs/history?limit=10');
      setJobHistory(response.data);
      toast.success('Job history loaded');
    } catch (error) {
      console.error('Job history error:', error);
      const errorMsg = error.response?.data?.error?.message || error.response?.data?.error || error.message || 'Failed to load job history';
      toast.error(errorMsg);
      setJobHistory(null);
    } finally {
      setLoading(false);
    }
  };

  const triggerQualityAudit = async () => {
    setLoading(true);
    try {
      const response = await api.post('/api/admin/quality/audit', {
        check_type: 'flag_poor_content',
        config: {}
      });
      toast.success('Quality audit triggered');
      console.log('Audit result:', response.data);
    } catch (error) {
      console.error('Audit error:', error);
      const errorMsg = error.response?.data?.error?.message || error.response?.data?.error || error.message || 'Failed to trigger audit';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const setupRecurringJobs = async () => {
    setLoading(true);
    try {
      const response = await api.post('/api/admin/recurring/setup', {});
      toast.success('Recurring jobs scheduled');
      console.log('Setup result:', response.data);
    } catch (error) {
      console.error('Setup error:', error);
      const errorMsg = error.response?.data?.error?.message || error.response?.data?.error || error.message || 'Failed to setup jobs';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">AI Content Pipeline</h1>
        <p className="text-gray-600">
          Monitor and manage AI-generated content quality and performance
        </p>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <button
          onClick={analyzeAllQuests}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
        >
          Analyze All Quests
        </button>

        <button
          onClick={updateMetrics}
          disabled={loading}
          className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-medium"
        >
          Update Metrics
        </button>

        <button
          onClick={getQualityReport}
          disabled={loading}
          className="bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 font-medium"
        >
          Quality Report (30d)
        </button>

        <button
          onClick={getMonthlyReport}
          disabled={loading}
          className="bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 font-medium"
        >
          Monthly Report
        </button>

        <button
          onClick={getJobHistory}
          disabled={loading}
          className="bg-gray-600 text-white px-4 py-3 rounded-lg hover:bg-gray-700 disabled:bg-gray-400 font-medium"
        >
          Job History
        </button>

        <button
          onClick={triggerQualityAudit}
          disabled={loading}
          className="bg-orange-600 text-white px-4 py-3 rounded-lg hover:bg-orange-700 disabled:bg-gray-400 font-medium"
        >
          Trigger Quality Audit
        </button>

        <button
          onClick={setupRecurringJobs}
          disabled={loading}
          className="bg-pink-600 text-white px-4 py-3 rounded-lg hover:bg-pink-700 disabled:bg-gray-400 font-medium"
        >
          Setup Recurring Jobs
        </button>
      </div>

      {/* Quest Analysis Results */}
      {analysisResult && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Quest Analysis</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded">
              <div className="text-2xl font-bold text-blue-700">
                {analysisResult.total_quests}
              </div>
              <div className="text-sm text-blue-600">Total Quests</div>
            </div>

            <div className="bg-green-50 p-4 rounded">
              <div className="text-2xl font-bold text-green-700">
                {analysisResult.summary?.healthy || 0}
              </div>
              <div className="text-sm text-green-600">Healthy</div>
            </div>

            <div className="bg-orange-50 p-4 rounded">
              <div className="text-2xl font-bold text-orange-700">
                {analysisResult.summary?.needs_attention || 0}
              </div>
              <div className="text-sm text-orange-600">Needs Attention</div>
            </div>

            <div className="bg-red-50 p-4 rounded">
              <div className="text-2xl font-bold text-red-700">
                {analysisResult.summary?.inactive || 0}
              </div>
              <div className="text-sm text-red-600">Inactive</div>
            </div>
          </div>

          {analysisResult.summary?.health_percentage !== undefined && (
            <div className="mb-4">
              <div className="flex justify-between mb-2">
                <span className="font-medium">Overall Health</span>
                <span className="font-bold">{analysisResult.summary.health_percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] h-4 rounded-full"
                  style={{ width: `${analysisResult.summary.health_percentage}%` }}
                ></div>
              </div>
            </div>
          )}

          {analysisResult.flagged_quests && analysisResult.flagged_quests.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Flagged Quests ({analysisResult.flagged_quests.length})</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {analysisResult.flagged_quests.map((quest, idx) => (
                  <div key={idx} className="border rounded p-3 bg-gray-50">
                    <div className="font-medium">{quest.quest_title}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      Status: <span className="font-medium">{quest.status}</span> |
                      Recommendation: <span className="font-medium">{quest.recommendation}</span>
                    </div>
                    {quest.issues && quest.issues.length > 0 && (
                      <div className="text-sm text-red-600 mt-1">
                        Issues: {quest.issues.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quality Report */}
      {qualityReport && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Quality Report (30 Days)</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-purple-50 p-4 rounded">
              <div className="text-2xl font-bold text-purple-700">
                {qualityReport.ai_content_metrics?.total_quests || 0}
              </div>
              <div className="text-sm text-purple-600">Total AI Quests</div>
            </div>

            <div className="bg-blue-50 p-4 rounded">
              <div className="text-2xl font-bold text-blue-700">
                {qualityReport.ai_content_metrics?.avg_engagement_score?.toFixed(3) || '0.000'}
              </div>
              <div className="text-sm text-blue-600">Avg Engagement</div>
            </div>

            <div className="bg-green-50 p-4 rounded">
              <div className="text-2xl font-bold text-green-700">
                {qualityReport.ai_content_metrics?.avg_completion_rate?.toFixed(3) || '0.000'}
              </div>
              <div className="text-sm text-green-600">Avg Completion</div>
            </div>
          </div>

          {qualityReport.quality_actions && Object.keys(qualityReport.quality_actions).length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Quality Actions Taken</h3>
              <div className="bg-gray-50 p-3 rounded">
                {Object.entries(qualityReport.quality_actions).map(([action, count]) => (
                  <div key={action} className="flex justify-between py-1">
                    <span className="capitalize">{action.replace('_', ' ')}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monthly Report */}
      {monthlyReport && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Monthly Report</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <h3 className="font-semibold mb-2">Overall Health</h3>
              <div className="bg-gray-50 p-3 rounded">
                <div className="flex justify-between py-1">
                  <span>Healthy</span>
                  <span className="font-medium text-green-600">{monthlyReport.overall_health?.healthy || 0}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Needs Attention</span>
                  <span className="font-medium text-orange-600">{monthlyReport.overall_health?.needs_attention || 0}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Inactive</span>
                  <span className="font-medium text-red-600">{monthlyReport.overall_health?.inactive || 0}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Content Creation (30d)</h3>
              <div className="bg-gray-50 p-3 rounded">
                <div className="flex justify-between py-1">
                  <span>Total Created</span>
                  <span className="font-medium">{monthlyReport.content_creation_trends?.total_created || 0}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>AI Generated</span>
                  <span className="font-medium">{monthlyReport.content_creation_trends?.ai_created || 0}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Human Created</span>
                  <span className="font-medium">{monthlyReport.content_creation_trends?.human_created || 0}</span>
                </div>
              </div>
            </div>
          </div>

          {monthlyReport.recommendations && monthlyReport.recommendations.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Strategic Recommendations</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {monthlyReport.recommendations.map((rec, idx) => (
                  <li key={idx} className="text-gray-700">{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Job History */}
      {jobHistory && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">Job History ({jobHistory.total})</h2>

          {jobHistory.jobs && jobHistory.jobs.length > 0 ? (
            <div className="space-y-2">
              {jobHistory.jobs.map((job, idx) => (
                <div key={idx} className="border rounded p-3 bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{job.job_type}</div>
                      <div className="text-sm text-gray-600">
                        {new Date(job.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      job.status === 'completed' ? 'bg-green-100 text-green-700' :
                      job.status === 'running' ? 'bg-blue-100 text-blue-700' :
                      job.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No jobs found</p>
          )}
        </div>
      )}
    </div>
  );
}
