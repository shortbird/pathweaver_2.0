import { useState, useEffect } from 'react';
import { FlagIcon, CheckIcon, TrashIcon, EyeIcon, XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { getPillarData } from '../../utils/pillarMappings';

export default function FlaggedTasksPanel() {
  const [flaggedTasks, setFlaggedTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskFlags, setTaskFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState(null);
  const [viewMode, setViewMode] = useState('table');

  useEffect(() => {
    loadFlaggedTasks();
  }, []);

  const loadFlaggedTasks = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/admin/flagged-tasks', {
        params: { limit: 50, offset: 0 }
      });
      setFlaggedTasks(response.data.tasks || []);
    } catch (err) {
      console.error('Failed to load flagged tasks:', err);
      toast.error('Failed to load flagged tasks');
    } finally {
      setLoading(false);
    }
  };

  const loadTaskFlags = async (taskId) => {
    try {
      const response = await api.get(`/api/admin/flagged-tasks/${taskId}/flags`);
      setTaskFlags(response.data.flags || []);
      setShowFlagModal(true);
    } catch (err) {
      console.error('Failed to load task flags:', err);
      toast.error('Failed to load flag details');
    }
  };

  const handleApproveTask = async (taskId) => {
    setActionLoading(true);
    try {
      await api.post(`/api/admin/flagged-tasks/${taskId}/approve`, {});
      toast.success('Task approved and unflagged');
      // Remove from list
      setFlaggedTasks(flaggedTasks.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Failed to approve task:', err);
      toast.error('Failed to approve task');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    setActionLoading(true);
    try {
      await api.delete(`/api/admin/flagged-tasks/${taskId}`);
      toast.success('Task permanently deleted');
      // Remove from list
      setFlaggedTasks(flaggedTasks.filter(t => t.id !== taskId));
      setDeleteConfirmTask(null);
    } catch (err) {
      console.error('Failed to delete task:', err);
      toast.error('Failed to delete task');
    } finally {
      setActionLoading(false);
    }
  };

  const getSeverityColor = (flagCount) => {
    if (flagCount >= 6) return 'bg-red-100 border-red-300 text-red-800';
    if (flagCount >= 3) return 'bg-orange-100 border-orange-300 text-orange-800';
    return 'bg-yellow-100 border-yellow-300 text-yellow-800';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-gray-500" style={{ fontFamily: 'Poppins' }}>Loading flagged tasks...</p>
        </div>
      </div>
    );
  }

  if (flaggedTasks.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <CheckIcon className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
            No Flagged Tasks to Review
          </h2>
          <p className="text-gray-600" style={{ fontFamily: 'Poppins' }}>
            All tasks in the library are approved!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
              Flagged Tasks Review
            </h1>
            <p className="text-gray-600" style={{ fontFamily: 'Poppins' }}>
              {flaggedTasks.length} task{flaggedTasks.length !== 1 ? 's' : ''} flagged for review
            </p>
          </div>
          {/* View Mode Toggle - Hidden on mobile (auto-shows cards) */}
          <div className="hidden md:flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                viewMode === 'table'
                  ? 'bg-optio-purple text-white'
                  : 'bg-transparent text-gray-700 hover:bg-gray-200'
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                viewMode === 'cards'
                  ? 'bg-optio-purple text-white'
                  : 'bg-transparent text-gray-700 hover:bg-gray-200'
              }`}
            >
              Cards
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Card View - shown on mobile or when viewMode === 'cards' */}
      <div className={`grid grid-cols-1 gap-4 ${viewMode === 'cards' ? 'block' : 'md:hidden'}`}>
        {flaggedTasks.map(task => {
          const pillarData = getPillarData(task.pillar);
          const severityColor = getSeverityColor(task.flag_count);
          const borderColor = task.flag_count >= 5 ? 'border-red-500' : task.flag_count >= 3 ? 'border-yellow-500' : 'border-gray-300';

          return (
            <div
              key={task.id}
              className={`bg-white rounded-xl p-4 border-l-4 shadow-sm ${borderColor}`}
            >
              <p className="text-xs text-gray-500 mb-1" style={{ fontFamily: 'Poppins' }}>
                {task.quests?.title || 'Unknown Quest'}
              </p>
              <h3 className="text-lg font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
                {task.title}
              </h3>
              <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                {task.description}
              </p>
              <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                  {pillarData.name}
                </span>
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border-2 ${severityColor}`}>
                  <FlagIcon className="w-3 h-3" />
                  <span className="text-xs font-bold">{task.flag_count}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setSelectedTask(task); loadTaskFlags(task.id); }}
                  className="flex-1 min-h-[44px] px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm font-semibold flex items-center justify-center gap-1"
                  style={{ fontFamily: 'Poppins' }}
                >
                  <EyeIcon className="w-4 h-4" />
                  View
                </button>
                <button
                  onClick={() => handleApproveTask(task.id)}
                  disabled={actionLoading}
                  className="flex-1 min-h-[44px] px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
                  style={{ fontFamily: 'Poppins' }}
                >
                  <CheckIcon className="w-4 h-4" />
                  Approve
                </button>
                <button
                  onClick={() => setDeleteConfirmTask(task)}
                  disabled={actionLoading}
                  className="min-h-[44px] min-w-[44px] px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table View - hidden on mobile, shown when viewMode === 'table' */}
      <div className={`bg-white rounded-xl shadow-md overflow-hidden ${viewMode === 'table' ? 'hidden md:block' : 'hidden'}`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>
                  Quest
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>
                  Task
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>
                  Pillar
                </th>
                <th className="px-6 py-4 text-center text-xs font-bold text-gray-700 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>
                  Flags
                </th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider" style={{ fontFamily: 'Poppins' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {flaggedTasks.map(task => {
                const pillarData = getPillarData(task.pillar);
                const severityColor = getSeverityColor(task.flag_count);

                return (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Poppins' }}>
                        {task.quests?.title || 'Unknown Quest'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-semibold text-gray-900 mb-1" style={{ fontFamily: 'Poppins' }}>
                        {task.title}
                      </div>
                      <div className="text-xs text-gray-500 line-clamp-2">
                        {task.description}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                        {pillarData.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border-2 ${severityColor}`}>
                        <FlagIcon className="w-4 h-4" />
                        <span className="font-bold" style={{ fontFamily: 'Poppins' }}>
                          {task.flag_count}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setSelectedTask(task); loadTaskFlags(task.id); }}
                          className="min-h-[44px] px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all text-sm font-semibold flex items-center gap-1"
                          style={{ fontFamily: 'Poppins' }}
                        >
                          <EyeIcon className="w-4 h-4" />
                          View Flags
                        </button>
                        <button
                          onClick={() => handleApproveTask(task.id)}
                          disabled={actionLoading}
                          className="min-h-[44px] px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
                          style={{ fontFamily: 'Poppins' }}
                        >
                          <CheckIcon className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => setDeleteConfirmTask(task)}
                          disabled={actionLoading}
                          className="min-h-[44px] px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
                          style={{ fontFamily: 'Poppins' }}
                        >
                          <TrashIcon className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Flag Details Modal */}
      {showFlagModal && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-4 sm:p-8 max-w-full sm:max-w-3xl w-full mx-2 sm:mx-0 max-h-[90vh] sm:max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Poppins' }}>
                  Flag Reports
                </h3>
                <p className="text-gray-600 font-semibold" style={{ fontFamily: 'Poppins' }}>
                  {selectedTask.title}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowFlagModal(false);
                  setSelectedTask(null);
                  setTaskFlags([]);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              >
                <XMarkIcon className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            {/* Task Details */}
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <p className="text-sm text-gray-700 mb-3" style={{ fontFamily: 'Poppins' }}>
                {selectedTask.description}
              </p>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                  {getPillarData(selectedTask.pillar).name}
                </span>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                  {selectedTask.xp_value} XP
                </span>
              </div>
            </div>

            {/* Flag Reports */}
            <div className="space-y-4">
              <h4 className="font-bold text-lg" style={{ fontFamily: 'Poppins' }}>
                Reports ({taskFlags.length})
              </h4>

              {taskFlags.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No flag details available</p>
              ) : (
                taskFlags.map((flag, index) => (
                  <div key={flag.id || index} className="border-2 border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins' }}>
                          {flag.users?.display_name || 'Anonymous'}
                        </span>
                        {flag.users?.email && (
                          <span className="text-xs text-gray-500">
                            ({flag.users.email})
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(flag.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {flag.flag_reason && (
                      <p className="text-sm text-gray-700 mt-2" style={{ fontFamily: 'Poppins' }}>
                        <strong>Reason:</strong> {flag.flag_reason}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  handleApproveTask(selectedTask.id);
                  setShowFlagModal(false);
                }}
                disabled={actionLoading}
                className="flex-1 px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 font-bold transition-all disabled:opacity-50"
                style={{ fontFamily: 'Poppins' }}
              >
                Approve Task
              </button>
              <button
                onClick={() => {
                  setShowFlagModal(false);
                  setDeleteConfirmTask(selectedTask);
                }}
                disabled={actionLoading}
                className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 font-bold transition-all disabled:opacity-50"
                style={{ fontFamily: 'Poppins' }}
              >
                Delete Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-4 sm:p-8 max-w-full sm:max-w-md w-full mx-2 sm:mx-0">
            <div className="text-center mb-6">
              <ExclamationTriangleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
                Delete Task Permanently?
              </h3>
              <p className="text-gray-600 mb-4" style={{ fontFamily: 'Poppins' }}>
                This will permanently remove <strong>{deleteConfirmTask.title}</strong> from the task library.
              </p>
              <p className="text-sm text-red-600" style={{ fontFamily: 'Poppins' }}>
                This action cannot be undone.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmTask(null)}
                className="flex-1 px-6 py-3 min-h-[44px] border-2 border-gray-300 rounded-xl hover:bg-gray-50 active:bg-gray-100 font-semibold transition-all touch-manipulation"
                style={{ fontFamily: 'Poppins' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteTask(deleteConfirmTask.id)}
                disabled={actionLoading}
                className="flex-1 px-6 py-3 min-h-[44px] bg-red-500 text-white rounded-xl hover:bg-red-600 active:bg-red-700 font-bold transition-all disabled:opacity-50 touch-manipulation"
                style={{ fontFamily: 'Poppins' }}
              >
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
