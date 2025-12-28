import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import AnnouncementCard from '../../components/AnnouncementCard';
import api from '../../services/api';
import toast from 'react-hot-toast';

/**
 * AnnouncementsFeed
 *
 * Student view of announcements feed.
 * Shows pinned announcements at top, followed by recent announcements.
 * Filters out expired announcements.
 */
const AnnouncementsFeed = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'pinned', 'quest'

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
    } catch (error) {
      console.error('Error fetching announcements:', error);
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const filteredAnnouncements = announcements.filter(announcement => {
    if (filter === 'pinned') return announcement.is_pinned;
    if (filter === 'quest') return announcement.target_audience === 'specific_quest';
    return true;
  });

  const pinnedCount = announcements.filter(a => a.is_pinned).length;
  const questCount = announcements.filter(a => a.target_audience === 'specific_quest').length;

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
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-optio-purple to-optio-pink text-transparent bg-clip-text">
            Announcements
          </h1>
          <p className="text-lg text-gray-600">
            Stay updated with the latest news and updates from your advisors and school.
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-4 mb-6 border-b border-gray-200">
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
          <button
            onClick={() => setFilter('quest')}
            className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
              filter === 'quest'
                ? 'border-optio-purple text-optio-purple'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Quest Specific ({questCount})
          </button>
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
                : "There are no quest-specific announcements."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredAnnouncements.map(announcement => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                isPinned={announcement.is_pinned}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnouncementsFeed;
