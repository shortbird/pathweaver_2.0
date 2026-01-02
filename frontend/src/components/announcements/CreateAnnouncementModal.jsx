import React, { useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

/**
 * CreateAnnouncementModal
 *
 * Modal for creating or editing announcements.
 * Used by both the org admin tab and the announcements feed.
 */
export default function CreateAnnouncementModal({ announcement, onClose, onSuccess }) {
  const isEditing = !!announcement;
  const [formData, setFormData] = useState({
    title: announcement?.title || '',
    message: announcement?.message || '',
    target_audience: announcement?.target_audience || ['all'],
    pinned: announcement?.pinned || false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const audienceOptions = [
    { value: 'all', label: 'Everyone' },
    { value: 'students', label: 'Students Only' },
    { value: 'parents', label: 'Parents Only' },
    { value: 'advisors', label: 'Advisors Only' }
  ];

  const handleAudienceChange = (value) => {
    setFormData(prev => ({
      ...prev,
      target_audience: [value]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isEditing) {
        await api.patch(`/api/announcements/${announcement.id}`, formData);
        toast.success('Announcement updated');
      } else {
        await api.post('/api/announcements', formData);
        toast.success('Announcement created');
      }
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${isEditing ? 'update' : 'create'} announcement`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">
            {isEditing ? 'Edit Announcement' : 'Create Announcement'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              placeholder="Announcement title"
              required
            />
          </div>

          {/* Message */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
              placeholder="Write your announcement message here..."
              rows={5}
              required
            />
            <p className="text-xs text-gray-500 mt-1">Markdown formatting is supported.</p>
          </div>

          {/* Target Audience */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Target Audience</label>
            <div className="flex flex-wrap gap-2">
              {audienceOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleAudienceChange(option.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    formData.target_audience.includes(option.value)
                      ? 'bg-optio-purple text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pin checkbox */}
          <div className="mb-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.pinned}
                onChange={(e) => setFormData({ ...formData, pinned: e.target.checked })}
                className="w-4 h-4 text-optio-purple border-gray-300 rounded focus:ring-optio-purple"
              />
              <span className="text-sm font-medium text-gray-700">
                Pin this announcement (appears at top)
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-7">
              Maximum 3 pinned announcements allowed per organization.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.title.trim() || !formData.message.trim()}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : isEditing ? 'Update' : 'Post Announcement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
