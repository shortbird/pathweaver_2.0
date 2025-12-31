import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';

/**
 * OrgAnnouncementsTab
 *
 * Organization announcements management tab for org admins.
 * Allows creating, viewing, editing, and deleting announcements for the organization.
 */
export default function OrgAnnouncementsTab({ orgId }) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);

  useEffect(() => {
    fetchAnnouncements();
  }, [orgId]);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/announcements');
      // Sort by pinned first, then by created_at
      const sorted = (response.data.announcements || []).sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
      setAnnouncements(sorted);
    } catch (error) {
      console.error('Error fetching announcements:', error);
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (announcementId) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    try {
      await api.delete(`/api/announcements/${announcementId}`);
      toast.success('Announcement deleted');
      fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      toast.error(error.response?.data?.error || 'Failed to delete announcement');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getAudienceLabel = (audience) => {
    if (!audience) return 'All';
    if (Array.isArray(audience)) {
      if (audience.includes('all')) return 'Everyone';
      return audience.map(a => {
        if (a === 'students') return 'Students';
        if (a === 'parents') return 'Parents';
        if (a === 'advisors') return 'Advisors';
        return a;
      }).join(', ');
    }
    return audience;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Announcements</h2>
          <p className="text-sm text-gray-600 mt-1">
            Create and manage announcements for your organization
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Announcement
        </button>
      </div>

      {/* Announcements List */}
      {announcements.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
          <p className="text-gray-500">
            No announcements yet. Click "Create Announcement" to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map(announcement => (
            <div
              key={announcement.id}
              className={`bg-white rounded-xl shadow-sm border ${
                announcement.pinned ? 'border-optio-purple/30 bg-optio-purple/5' : 'border-gray-100'
              } overflow-hidden`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {announcement.pinned && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-optio-purple/10 text-optio-purple text-xs font-medium rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v2a2 2 0 01-2 2H7a2 2 0 01-2-2V5zm6 10a1 1 0 11-2 0 1 1 0 012 0zm-1-5a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z" />
                          </svg>
                          Pinned
                        </span>
                      )}
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {announcement.title}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {announcement.message}
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatDate(announcement.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {getAudienceLabel(announcement.target_audience)}
                      </span>
                      {announcement.author && (
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {announcement.author.display_name || `${announcement.author.first_name || ''} ${announcement.author.last_name || ''}`.trim() || 'Unknown'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setEditingAnnouncement(announcement)}
                      className="p-2 text-gray-400 hover:text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(announcement.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingAnnouncement) && (
        <AnnouncementModal
          announcement={editingAnnouncement}
          onClose={() => {
            setShowCreateModal(false);
            setEditingAnnouncement(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setEditingAnnouncement(null);
            fetchAnnouncements();
          }}
        />
      )}
    </div>
  );
}

function AnnouncementModal({ announcement, onClose, onSuccess }) {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">
          {isEditing ? 'Edit Announcement' : 'Create Announcement'}
        </h2>

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
              {loading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
