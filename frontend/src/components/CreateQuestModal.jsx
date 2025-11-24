import { useState } from 'react';
import { X } from 'lucide-react';
import api from '../services/api';

/**
 * CreateQuestModal - Modal for users to create their own quests
 *
 * Users can create quests directly, which are private by default (visible only to them)
 * until an admin makes them public. Created quests are immediately available for use.
 */
const CreateQuestModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate
    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    if (!formData.description.trim()) {
      setError('Description is required');
      return;
    }

    setIsSubmitting(true);

    try {
      // Call the new user quest creation endpoint
      const response = await api.post('/api/quests/create', {
        title: formData.title.trim(),
        big_idea: formData.description.trim()
      });

      if (response.data.success) {
        // Reset form
        setFormData({ title: '', description: '' });

        // Call success callback
        if (onSuccess) {
          onSuccess(response.data.quest);
        }

        // Close modal
        onClose();
      } else {
        setError(response.data.error || 'Failed to create quest');
      }
    } catch (err) {
      console.error('Error creating quest:', err);
      setError(err.response?.data?.error || 'Failed to create quest. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
            Create Your Own Quest
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isSubmitting}
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Info box */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              Create a quest that's meaningful to <strong>you</strong>. Your quest will be private (visible only to you)
              until you complete it. You can start working on it right away!
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Title input */}
          <div>
            <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
              Quest Title *
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g., Learn to Play Guitar, Build a Personal Website, etc."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              disabled={isSubmitting}
              maxLength={200}
            />
            <p className="mt-1 text-xs text-gray-500">
              {formData.title.length}/200 characters
            </p>
          </div>

          {/* Description input */}
          <div>
            <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
              Quest Description *
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Describe what you want to learn or accomplish. What skills will you develop? What will you create?"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
              rows={6}
              disabled={isSubmitting}
              maxLength={2000}
            />
            <p className="mt-1 text-xs text-gray-500">
              {formData.description.length}/2000 characters
            </p>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Quest'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateQuestModal;
