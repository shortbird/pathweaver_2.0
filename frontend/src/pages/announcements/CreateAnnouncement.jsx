import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import toast from 'react-hot-toast';

/**
 * CreateAnnouncement
 *
 * Advisor/admin interface to create announcements.
 * Supports markdown content, target audience selection, expiration dates, and pinning.
 */
const CreateAnnouncement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    target_audience: 'all_students',
    quest_id: null,
    is_pinned: false,
    expires_at: ''
  });
  const [quests, setQuests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(false);

  // Check if user has permission
  const hasPermission = user?.role && ['admin', 'superadmin', 'advisor'].includes(user.role);

  useEffect(() => {
    if (!hasPermission) {
      toast.error('You do not have permission to create announcements');
      navigate('/');
      return;
    }

    // Fetch available quests for quest-specific targeting
    fetchQuests();
  }, [hasPermission, navigate]);

  const fetchQuests = async () => {
    try {
      const response = await api.get('/api/quests');
      setQuests(response.data.quests || []);
    } catch (error) {
      console.error('Error fetching quests:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      // Clear quest_id if target audience is not specific_quest
      ...(name === 'target_audience' && value !== 'specific_quest' ? { quest_id: null } : {})
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!formData.content.trim()) {
      toast.error('Please enter content');
      return;
    }
    if (formData.target_audience === 'specific_quest' && !formData.quest_id) {
      toast.error('Please select a quest for quest-specific announcements');
      return;
    }

    try {
      setLoading(true);

      const payload = {
        ...formData,
        expires_at: formData.expires_at || null
      };

      await api.post('/api/announcements', payload);

      toast.success('Announcement created successfully!');
      navigate('/announcements');
    } catch (error) {
      console.error('Error creating announcement:', error);
      toast.error(error.response?.data?.error || 'Failed to create announcement');
    } finally {
      setLoading(false);
    }
  };

  if (!hasPermission) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/announcements')}
            className="text-optio-purple hover:text-optio-pink mb-4 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back to Announcements
          </button>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-optio-purple to-optio-pink text-transparent bg-clip-text">
            Create Announcement
          </h1>
          <p className="text-lg text-gray-600">
            Share important updates and information with your students.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              placeholder="Enter announcement title"
              required
            />
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="content" className="block text-sm font-medium text-gray-700">
                Content <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setPreview(!preview)}
                className="text-sm text-optio-purple hover:text-optio-pink"
              >
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {!preview ? (
              <textarea
                id="content"
                name="content"
                value={formData.content}
                onChange={handleChange}
                rows={10}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent font-mono text-sm"
                placeholder="Write your announcement content here. Markdown is supported for formatting."
                required
              />
            ) : (
              <div className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 prose prose-sm max-w-none min-h-[250px]">
                <div dangerouslySetInnerHTML={{ __html: formData.content.replace(/\n/g, '<br/>') }} />
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Supports markdown: **bold**, *italic*, [links](url), bullet lists, and more.
            </p>
          </div>

          {/* Target Audience */}
          <div>
            <label htmlFor="target_audience" className="block text-sm font-medium text-gray-700 mb-2">
              Target Audience
            </label>
            <select
              id="target_audience"
              name="target_audience"
              value={formData.target_audience}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            >
              <option value="all_students">All Students</option>
              <option value="specific_quest">Specific Quest</option>
              <option value="specific_users">Specific Users</option>
            </select>
          </div>

          {/* Quest selection (if specific_quest) */}
          {formData.target_audience === 'specific_quest' && (
            <div>
              <label htmlFor="quest_id" className="block text-sm font-medium text-gray-700 mb-2">
                Select Quest <span className="text-red-500">*</span>
              </label>
              <select
                id="quest_id"
                name="quest_id"
                value={formData.quest_id || ''}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                required
              >
                <option value="">Select a quest...</option>
                {quests.map(quest => (
                  <option key={quest.id} value={quest.id}>
                    {quest.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Expiration date */}
          <div>
            <label htmlFor="expires_at" className="block text-sm font-medium text-gray-700 mb-2">
              Expiration Date (Optional)
            </label>
            <input
              type="datetime-local"
              id="expires_at"
              name="expires_at"
              value={formData.expires_at}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave empty for announcements that don't expire.
            </p>
          </div>

          {/* Pinned checkbox */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_pinned"
              name="is_pinned"
              checked={formData.is_pinned}
              onChange={handleChange}
              className="w-4 h-4 text-optio-purple border-gray-300 rounded focus:ring-optio-purple"
            />
            <label htmlFor="is_pinned" className="text-sm font-medium text-gray-700">
              Pin this announcement (will appear at the top of the list)
            </label>
          </div>

          {/* Submit buttons */}
          <div className="flex items-center gap-4 pt-6 border-t border-gray-200">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Announcement'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/announcements')}
              className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateAnnouncement;
