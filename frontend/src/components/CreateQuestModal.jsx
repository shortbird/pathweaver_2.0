import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Modal, Alert, FormField, FormFooter } from './ui';
import SimilarQuestAutocomplete from './SimilarQuestAutocomplete';

/**
 * CreateQuestModal - Modal for users to create their own quests
 *
 * Users can create quests directly, which are private by default (visible only to them)
 * until an admin makes them public. Created quests are immediately available for use.
 */
const CreateQuestModal = ({ isOpen, onClose, onSuccess }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Show suggestions when title has 3+ characters
    if (name === 'title') {
      setShowSuggestions(value.length >= 3);
    }
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSelectSimilarQuest = (selectedQuest) => {
    if (window.confirm(`Use the existing quest "${selectedQuest.title}" instead of creating a new one?`)) {
      onClose();
      navigate(`/quests/${selectedQuest.id}`);
    }
    setShowSuggestions(false);
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Your Own Quest"
      className="max-w-full sm:max-w-2xl mx-2 sm:mx-0"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Info box */}
        <Alert variant="purple">
          Create your own quest and start working right away!
        </Alert>

        {/* Error message */}
        {error && (
          <Alert variant="error">
            {error}
          </Alert>
        )}

        {/* Title input */}
        <div className="relative">
          <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
            Quest Title *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            onFocus={() => formData.title.length >= 3 && setShowSuggestions(true)}
            placeholder="e.g., Learn to Play Guitar, Build a Personal Website, etc."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px]"
            disabled={isSubmitting}
            maxLength={200}
            autoComplete="off"
          />

          {/* Similar quest suggestions */}
          <SimilarQuestAutocomplete
            searchTerm={formData.title}
            onSelectQuest={handleSelectSimilarQuest}
            onClose={() => setShowSuggestions(false)}
            isOpen={showSuggestions}
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
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none min-h-[120px]"
            rows={6}
            disabled={isSubmitting}
            maxLength={2000}
          />
          <p className="mt-1 text-xs text-gray-500">
            {formData.description.length}/2000 characters
          </p>
        </div>

        {/* Footer buttons */}
        <FormFooter
          onCancel={onClose}
          onSubmit={handleSubmit}
          cancelText="Cancel"
          submitText={isSubmitting ? 'Creating...' : 'Create Quest'}
          isSubmitting={isSubmitting}
        />
      </form>
    </Modal>
  );
};

export default CreateQuestModal;
