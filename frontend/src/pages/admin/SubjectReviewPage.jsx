import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import Button from '../../components/ui/Button';

const SUBJECT_NAMES = {
  'language_arts': 'Language Arts',
  'math': 'Mathematics',
  'science': 'Science',
  'social_studies': 'Social Studies',
  'financial_literacy': 'Financial Literacy',
  'health': 'Health',
  'pe': 'Physical Education',
  'fine_arts': 'Fine Arts',
  'cte': 'Career & Technical Education',
  'digital_literacy': 'Digital Literacy',
  'electives': 'Electives'
};

const SUBJECT_COLORS = {
  'language_arts': 'from-blue-500 to-indigo-600',
  'math': 'from-green-500 to-emerald-600',
  'science': 'from-purple-500 to-violet-600',
  'social_studies': 'from-amber-500 to-orange-600',
  'financial_literacy': 'from-emerald-500 to-teal-600',
  'health': 'from-rose-500 to-optio-pink',
  'pe': 'from-cyan-500 to-blue-600',
  'fine_arts': 'from-optio-purple to-optio-pink',
  'cte': 'from-slate-500 to-gray-600',
  'digital_literacy': 'from-indigo-500 to-blue-600',
  'electives': 'from-gray-500 to-slate-600'
};

const SubjectReviewPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('unclassified');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const [editingTask, setEditingTask] = useState(null);
  const [editDistribution, setEditDistribution] = useState({});
  const [processingTasks, setProcessingTasks] = useState(new Set());

  const TASKS_PER_PAGE = 20;

  useEffect(() => {
    fetchStats();
    fetchTasks();
  }, [status, currentPage]);

  const fetchStats = async () => {
    try {
      const response = await api.get('/api/admin/subject-backfill/stats');
      setStats(response.data.stats);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const offset = currentPage * TASKS_PER_PAGE;
      const response = await api.get('/api/admin/subject-backfill/tasks', {
        params: { status, limit: TASKS_PER_PAGE, offset }
      });
      setTasks(response.data.tasks);
      setTotalTasks(response.data.total);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDistribution = async (taskId) => {
    setProcessingTasks(prev => new Set(prev).add(taskId));
    try {
      const response = await api.get(`/api/admin/subject-backfill/preview/${taskId}`);
      const task = response.data.task;

      setEditingTask(task);
      setEditDistribution(task.proposed_distribution);
    } catch (error) {
      console.error('Error generating distribution:', error);
      alert('Failed to generate distribution');
    } finally {
      setProcessingTasks(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleRegenerateDistribution = async (taskId) => {
    if (!confirm('Regenerate AI classification for this task?')) return;

    setProcessingTasks(prev => new Set(prev).add(taskId));
    try {
      await api.post(`/api/admin/subject-backfill/task/${taskId}/regenerate`, {});
      alert('Distribution regenerated successfully');
      fetchTasks();
      fetchStats();
    } catch (error) {
      console.error('Error regenerating distribution:', error);
      alert('Failed to regenerate distribution');
    } finally {
      setProcessingTasks(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  const handleSaveDistribution = async () => {
    if (!editingTask) return;

    const total = Object.values(editDistribution).reduce((sum, val) => sum + val, 0);
    if (total !== editingTask.xp_value) {
      alert(`XP must sum to ${editingTask.xp_value}, currently sums to ${total}`);
      return;
    }

    try {
      await api.put(`/api/admin/subject-backfill/task/${editingTask.id}/distribution`, {
        subject_xp_distribution: editDistribution
      });
      alert('Distribution saved successfully');
      setEditingTask(null);
      setEditDistribution({});
      fetchTasks();
      fetchStats();
    } catch (error) {
      console.error('Error saving distribution:', error);
      alert(error.response?.data?.error || 'Failed to save distribution');
    }
  };

  const handleEditDistributionValue = (subject, value) => {
    setEditDistribution(prev => ({
      ...prev,
      [subject]: parseInt(value) || 0
    }));
  };

  const handleAddSubject = (subject) => {
    if (editDistribution[subject]) return;
    setEditDistribution(prev => ({ ...prev, [subject]: 0 }));
  };

  const handleRemoveSubject = (subject) => {
    setEditDistribution(prev => {
      const next = { ...prev };
      delete next[subject];
      return next;
    });
  };

  const totalPages = Math.ceil(totalTasks / TASKS_PER_PAGE);

  const getDistributionTotal = (dist) => {
    return Object.values(dist || {}).reduce((sum, val) => sum + val, 0);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-6">
          <button
            onClick={() => navigate('/admin')}
            className="text-optio-purple hover:text-optio-pink mb-4"
          >
            Back to Admin Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Subject XP Review</h1>
          <p className="text-gray-600 mt-2">
            Review and edit AI-generated subject classifications for tasks
          </p>
        </div>

        {stats && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Classification Progress</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.total_tasks}</div>
                <div className="text-sm text-gray-600">Total Tasks</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{stats.with_distribution}</div>
                <div className="text-sm text-gray-600">Classified</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{stats.without_distribution}</div>
                <div className="text-sm text-gray-600">Unclassified</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-optio-purple">{stats.percentage_complete}%</div>
                <div className="text-sm text-gray-600">Complete</div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex gap-4 mb-4">
            <button
              onClick={() => { setStatus('unclassified'); setCurrentPage(0); }}
              className={`px-4 py-2 rounded-lg font-medium ${
                status === 'unclassified'
                  ? 'bg-optio-purple text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Unclassified ({stats?.without_distribution || 0})
            </button>
            <button
              onClick={() => { setStatus('classified'); setCurrentPage(0); }}
              className={`px-4 py-2 rounded-lg font-medium ${
                status === 'classified'
                  ? 'bg-optio-purple text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Classified ({stats?.with_distribution || 0})
            </button>
            <button
              onClick={() => { setStatus('all'); setCurrentPage(0); }}
              className={`px-4 py-2 rounded-lg font-medium ${
                status === 'all'
                  ? 'bg-optio-purple text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({stats?.total_tasks || 0})
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No tasks found in this category
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {tasks.map(task => (
                  <div key={task.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{task.title}</h3>
                        {task.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex gap-3 mt-2">
                          <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                            Pillar: {task.pillar}
                          </span>
                          <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                            XP: {task.xp_value || 100}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {task.subject_xp_distribution ? (
                          <>
                            <Button
                              onClick={() => handleRegenerateDistribution(task.id)}
                              disabled={processingTasks.has(task.id)}
                              variant="secondary"
                              size="sm"
                            >
                              {processingTasks.has(task.id) ? 'Regenerating...' : 'Regenerate'}
                            </Button>
                            <Button
                              onClick={() => {
                                setEditingTask(task);
                                setEditDistribution(task.subject_xp_distribution);
                              }}
                              variant="primary"
                              size="sm"
                            >
                              Edit
                            </Button>
                          </>
                        ) : (
                          <Button
                            onClick={() => handleGenerateDistribution(task.id)}
                            disabled={processingTasks.has(task.id)}
                            variant="primary"
                            size="sm"
                          >
                            {processingTasks.has(task.id) ? 'Generating...' : 'Generate'}
                          </Button>
                        )}
                      </div>
                    </div>

                    {task.subject_xp_distribution && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="text-xs font-medium text-gray-700 mb-2">Subject Distribution:</div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(task.subject_xp_distribution).map(([subject, xp]) => (
                            <div
                              key={subject}
                              className={`px-3 py-1 rounded-lg bg-gradient-to-r ${SUBJECT_COLORS[subject]} text-white text-xs font-medium`}
                            >
                              {SUBJECT_NAMES[subject]}: {xp} XP
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-6">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                    className="px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Edit Subject Distribution</h2>
                <p className="text-sm text-gray-600 mt-1">{editingTask.title}</p>
              </div>
              <button
                onClick={() => {
                  setEditingTask(null);
                  setEditDistribution({});
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600">Total XP: {editingTask.xp_value || 100}</div>
              <div className={`text-sm font-medium ${
                getDistributionTotal(editDistribution) === (editingTask.xp_value || 100)
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                Current Sum: {getDistributionTotal(editDistribution)}
              </div>
            </div>

            <div className="space-y-3 mb-4">
              {Object.entries(editDistribution).map(([subject, xp]) => (
                <div key={subject} className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {SUBJECT_NAMES[subject]}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={editingTask.xp_value || 100}
                      value={xp}
                      onChange={(e) => handleEditDistributionValue(subject, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveSubject(subject)}
                    className="mt-6 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add Subject
              </label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddSubject(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              >
                <option value="">Select a subject...</option>
                {Object.entries(SUBJECT_NAMES)
                  .filter(([key]) => !editDistribution[key])
                  .map(([key, name]) => (
                    <option key={key} value={key}>{name}</option>
                  ))}
              </select>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                onClick={() => {
                  setEditingTask(null);
                  setEditDistribution({});
                }}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveDistribution}
                variant="primary"
                disabled={getDistributionTotal(editDistribution) !== (editingTask.xp_value || 100)}
              >
                Save Distribution
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubjectReviewPage;
