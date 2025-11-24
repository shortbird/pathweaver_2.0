import { useState, useEffect } from 'react';
import { X, User, TrendingUp, Target, Loader } from 'lucide-react';
import StudentTasksPanel from './StudentTasksPanel';
import api from '../../services/api';

export default function StudentDetailModal({ student, onClose, onTasksUpdated }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [quests, setQuests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeTab === 'tasks') {
      loadStudentQuests();
    }
  }, [activeTab, student.id]);

  const loadStudentQuests = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get(`/api/advisor/students/${student.id}/quests-with-tasks`);
      if (response.data.success) {
        setQuests(response.data.quests || []);
      } else {
        setError(response.data.error || 'Failed to load quests');
      }
    } catch (err) {
      console.error('Failed to load student quests:', err);
      setError(err.response?.data?.error || 'Failed to load quests');
    } finally {
      setLoading(false);
    }
  };

  const handleTaskUpdate = async (questId, taskId, updatedData) => {
    try {
      const response = await api.put(
        `/api/admin/users/${student.id}/quests/${questId}/tasks/${taskId}`,
        updatedData
      );

      if (response.data.success) {
        // Reload quests to get updated data
        await loadStudentQuests();
        if (onTasksUpdated) {
          onTasksUpdated();
        }
      } else {
        throw new Error(response.data.error || 'Failed to update task');
      }
    } catch (err) {
      console.error('Failed to update task:', err);
      throw new Error(err.response?.data?.error || 'Failed to update task');
    }
  };

  const handleTaskDelete = async (questId, taskId) => {
    try {
      const response = await api.delete(
        `/api/admin/users/${student.id}/quests/${questId}/tasks/${taskId}`
      );

      if (response.data.success) {
        // Reload quests to get updated data
        await loadStudentQuests();
        if (onTasksUpdated) {
          onTasksUpdated();
        }
      } else {
        throw new Error(response.data.error || 'Failed to delete task');
      }
    } catch (err) {
      console.error('Failed to delete task:', err);
      throw new Error(err.response?.data?.error || 'Failed to delete task');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            {student.avatar_url ? (
              <img
                src={student.avatar_url}
                alt={student.display_name}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
            )}
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">{student.display_name}</h2>
              <p className="text-sm text-gray-600">{student.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('overview')}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'overview'
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'tasks'
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              Manage Tasks
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-4 text-white">
                  <div className="flex items-center space-x-3">
                    <Target className="w-8 h-8" />
                    <div>
                      <p className="text-sm opacity-90">Total XP</p>
                      <p className="text-2xl font-bold">{student.total_xp || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-4 text-white">
                  <div className="flex items-center space-x-3">
                    <TrendingUp className="w-8 h-8" />
                    <div>
                      <p className="text-sm opacity-90">Quests Completed</p>
                      <p className="text-2xl font-bold">{student.quest_count || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg p-4 text-white">
                  <div className="flex items-center space-x-3">
                    <User className="w-8 h-8" />
                    <div>
                      <p className="text-sm opacity-90">Level</p>
                      <p className="text-2xl font-bold">{student.level || 1}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Student Information</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Display Name</span>
                    <span className="text-sm font-medium text-gray-900">{student.display_name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Email</span>
                    <span className="text-sm font-medium text-gray-900">{student.email}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Last Active</span>
                    <span className="text-sm font-medium text-gray-900">
                      {student.last_active
                        ? new Date(student.last_active).toLocaleDateString()
                        : 'Never'
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-4">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-8 h-8 text-optio-purple animate-spin" />
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              {!loading && !error && quests.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-600">This student has no active quests yet.</p>
                </div>
              )}

              {!loading && !error && quests.length > 0 && (
                <div className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Active Quests</h3>
                    <p className="text-sm text-gray-600">
                      Click on a quest to view and edit its tasks
                    </p>
                  </div>

                  {quests.map((quest) => (
                    <StudentTasksPanel
                      key={quest.quest_id}
                      quest={quest}
                      onTaskUpdate={handleTaskUpdate}
                      onTaskDelete={handleTaskDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-md hover:opacity-90 transition-opacity"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
