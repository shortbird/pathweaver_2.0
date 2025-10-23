import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';

const QuestSuggestionModal = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast.error('Quest title is required');
      return;
    }
    
    if (!formData.description.trim()) {
      toast.error('Quest description is required');
      return;
    }

    if (formData.title.length > 200) {
      toast.error('Title must be less than 200 characters');
      return;
    }

    if (formData.description.length > 1000) {
      toast.error('Description must be less than 1000 characters');
      return;
    }

    setIsSubmitting(true);
    
    try {
      await api.post('/api/quest-ideas', {
        title: formData.title.trim(),
        description: formData.description.trim()
      });
      
      toast.success('Quest suggestion submitted for review!');
      onSuccess && onSuccess();
      onClose();
    } catch (error) {
      console.error('Error submitting quest suggestion:', error);
      toast.error(error.response?.data?.error || 'Failed to submit quest suggestion');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold bg-gradient-to-r bg-gradient-primary-reverse bg-clip-text text-transparent">
            Suggest a Quest
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quest Title
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Enter the title of your quest idea..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
              maxLength={200}
              disabled={isSubmitting}
            />
            <div className="text-right text-xs text-gray-500 mt-1">
              {formData.title.length}/200
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Describe what you'd like to learn or do in this quest..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
              rows="4"
              maxLength={1000}
              disabled={isSubmitting}
            />
            <div className="text-right text-xs text-gray-500 mt-1">
              {formData.description.length}/1000
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gradient-to-r bg-gradient-primary-reverse text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              )}
              Submit Suggestion
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuestSuggestionModal;