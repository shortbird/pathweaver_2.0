import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AnnouncementCard, { AnnouncementModal } from '../../components/AnnouncementCard';
import CreateAnnouncementModal from '../../components/announcements/CreateAnnouncementModal';
import api from '../../services/api';
import toast from 'react-hot-toast';

/**
 * AnnouncementsFeed
 *
 * Announcements feed for all users.
 * Shows pinned announcements at top, followed by recent announcements.
 * Tracks read/unread status.
 * Org admins and superadmins can create announcements.
 */
const AnnouncementsFeed = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [readIds, setReadIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'pinned', 'unread'
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Check if user can create announcements
  const canCreateAnnouncements = user?.role === 'superadmin' ||
    user?.role === 'org_admin' ||
    user?.role === 'advisor' ||
    user?.is_org_admin;

  useEffect(() => {
    fetchAnnouncements();
  }, [user]);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/announcements');

      // Sort announcements: pinned first, then by created_at desc
      const sorted = (response.data.announcements || []).sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });

      setAnnouncements(sorted);

      // Track which announcements are already read
      const alreadyRead = new Set(
        sorted.filter(a => a.is_read).map(a => a.id)
      );
      setReadIds(alreadyRead);
    } catch (error) {
      console.error('Error fetching announcements:', error);
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const handleAnnouncementClick = async (announcement) => {
    setSelectedAnnouncement(announcement);

    // Mark as read if not already
    if (!readIds.has(announcement.id)) {
      try {
        await api.post(`/api/announcements/${announcement.id}/read`, {});
        setReadIds(prev => new Set([...prev, announcement.id]));
        // Notify other components (like Sidebar) to update their unread count
        window.dispatchEvent(new CustomEvent('announcement-read'));
      } catch (error) {
        console.error('Error marking announcement as read:', error);
      }
    }
  };

  const handleCloseModal = () => {
    setSelectedAnnouncement(null);
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    fetchAnnouncements();
    // Notify sidebar to update unread count
    window.dispatchEvent(new CustomEvent('announcement-read'));
  };

  const handleDeleteAnnouncement = async (announcementId) => {
    try {
      await api.delete(`/api/announcements/${announcementId}`);
      toast.success('Announcement deleted');
      setSelectedAnnouncement(null);
      fetchAnnouncements();
      // Notify sidebar to update unread count
      window.dispatchEvent(new CustomEvent('announcement-read'));
    } catch (error) {
      console.error('Error deleting announcement:', error);
      toast.error(error.response?.data?.error || 'Failed to delete announcement');
    }
  };

  // Check if user can delete a specific announcement
  const canDeleteAnnouncement = (announcement) => {
    if (!user) return false;
    // Org admins and superadmins can delete any announcement
    if (user.role === 'superadmin' || user.role === 'org_admin' || user.is_org_admin) {
      return true;
    }
    // Authors can delete their own announcements
    return announcement.author_id === user.id;
  };

  const filteredAnnouncements = announcements.filter(announcement => {
    if (filter === 'pinned') return announcement.is_pinned;
    if (filter === 'unread') return !readIds.has(announcement.id);
    return true;
  });

  const pinnedCount = announcements.filter(a => a.is_pinned).length;
  const unreadCount = announcements.filter(a => !readIds.has(a.id)).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-8"></div>
            <div className="space-y-4">
              <div className="h-48 bg-gray-200 rounded"></div>
              <div className="h-48 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-optio-purple to-optio-pink text-transparent bg-clip-text">
              Announcements
            </h1>
            <p className="text-lg text-gray-600">
              Stay updated with the latest news and updates from your advisors and school.
            </p>
          </div>
          {canCreateAnnouncements && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium rounded-lg hover:opacity-90 transition-opacity shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Announcement
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap items-center gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setFilter('all')}
            className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
              filter === 'all'
                ? 'border-optio-purple text-optio-purple'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            All ({announcements.length})
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => setFilter('unread')}
              className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors flex items-center gap-1.5 ${
                filter === 'unread'
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Unread
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-optio-purple rounded-full">
                {unreadCount}
              </span>
            </button>
          )}
          {pinnedCount > 0 && (
            <button
              onClick={() => setFilter('pinned')}
              className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
                filter === 'pinned'
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Pinned ({pinnedCount})
            </button>
          )}
        </div>

        {/* Announcements list */}
        {filteredAnnouncements.length === 0 ? (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <h3 className="mt-2 text-lg font-medium text-gray-900">No announcements</h3>
            <p className="mt-1 text-gray-500">
              {filter === 'all'
                ? "There are no announcements at this time."
                : filter === 'pinned'
                ? "There are no pinned announcements."
                : "You're all caught up!"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAnnouncements.map(announcement => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                isPinned={announcement.is_pinned}
                isUnread={!readIds.has(announcement.id)}
                onClick={() => handleAnnouncementClick(announcement)}
              />
            ))}
          </div>
        )}

        {/* View Announcement Modal */}
        <AnnouncementModal
          announcement={selectedAnnouncement}
          isOpen={!!selectedAnnouncement}
          onClose={handleCloseModal}
          onDelete={handleDeleteAnnouncement}
          canDelete={selectedAnnouncement ? canDeleteAnnouncement(selectedAnnouncement) : false}
        />

        {/* Create Announcement Modal */}
        {showCreateModal && (
          <CreateAnnouncementModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={handleCreateSuccess}
          />
        )}
      </div>
    </div>
  );
};

export default AnnouncementsFeed;
