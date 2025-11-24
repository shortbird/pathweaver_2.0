import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const PILLARS = [
  { value: 'stem', label: 'STEM', color: 'bg-blue-500' },
  { value: 'wellness', label: 'Wellness', color: 'bg-green-500' },
  { value: 'communication', label: 'Communication', color: 'bg-yellow-500' },
  { value: 'civics', label: 'Civics', color: 'bg-purple-500' },
  { value: 'art', label: 'Art', color: 'bg-pink-500' }
];

export default function TaskEditModal({ task, onClose, onSave }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    pillar: 'stem',
    xp_value: 100,
    is_required: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || '',
        description: task.description || '',
        pillar: task.pillar || 'stem',
        xp_value: task.xp_value || 100,
        is_required: task.is_required !== undefined ? task.is_required : true
      });
    }
  }, [task]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.title.trim()) {
      setError('Task title is required');
      return;
    }

    if (formData.xp_value <= 0) {
      setError('XP value must be greater than 0');
      return;
    }

    setLoading(true);

    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-900">Edit Task</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
              Task Title
            </label>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
              placeholder="Enter task title"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
              Task Description
            </label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-optio-purple focus:border-optio-purple resize-none"
              placeholder="Enter task description"
            />
          </div>

          {/* Pillar Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Skill Pillar
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PILLARS.map((pillar) => (
                <button
                  key={pillar.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, pillar: pillar.value })}
                  className={`
                    px-4 py-3 rounded-md border-2 transition-all
                    ${formData.pillar === pillar.value
                      ? 'border-optio-purple bg-optio-purple bg-opacity-10'
                      : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${pillar.color}`} />
                    <span className="text-sm font-medium text-gray-900">{pillar.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* XP Value */}
          <div>
            <label htmlFor="xp_value" className="block text-sm font-semibold text-gray-700 mb-2">
              XP Value
            </label>
            <input
              type="number"
              id="xp_value"
              value={formData.xp_value}
              onChange={(e) => setFormData({ ...formData, xp_value: parseInt(e.target.value) || 0 })}
              min="1"
              step="1"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              XP awarded when student completes this task
            </p>
          </div>

          {/* Required Checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_required"
              checked={formData.is_required}
              onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
              className="w-4 h-4 text-optio-purple border-gray-300 rounded focus:ring-optio-purple"
            />
            <label htmlFor="is_required" className="ml-2 text-sm text-gray-700">
              Required task (must be completed to finish quest)
            </label>
          </div>

          {/* Task Status Warning */}
          {task?.completed && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <p className="text-yellow-800 text-sm">
                <strong>Note:</strong> This task has already been completed by the student.
                You cannot edit completed tasks.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || task?.completed}
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
