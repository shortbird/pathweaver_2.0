import React from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * AnnouncementCard
 *
 * Displays a single announcement with markdown content, author, and timestamp.
 * Shows pinned status and expiration date if applicable.
 */
const AnnouncementCard = ({ announcement, isPinned = false }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      const minutes = Math.floor(diffInHours * 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (diffInHours < 24) {
      const hours = Math.floor(diffInHours);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (diffInHours < 168) {
      const days = Math.floor(diffInHours / 24);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const isExpiringSoon = () => {
    if (!announcement.expires_at) return false;
    const expiresAt = new Date(announcement.expires_at);
    const now = new Date();
    const diffInHours = (expiresAt - now) / (1000 * 60 * 60);
    return diffInHours <= 48 && diffInHours > 0;
  };

  return (
    <div className={`bg-white rounded-lg shadow-md border-2 ${isPinned ? 'border-optio-purple' : 'border-gray-100'} overflow-hidden`}>
      {/* Pinned indicator */}
      {isPinned && (
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink px-4 py-2 flex items-center gap-2">
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L11 4.323V3a1 1 0 011-1h-2zM9 5.323V3a1 1 0 00-1-1H6a1 1 0 00-1 1v2.323l-3.954 1.582-1.599-.8a1 1 0 10-.894 1.79l1.233.616-1.738 5.42a1 1 0 00.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 012.667-1.019 1 1 0 00.285-1.05l-1.738-5.42 1.233-.617a1 1 0 10-.894-1.788l-1.599.799L9 5.323z" />
          </svg>
          <span className="text-white font-semibold text-sm">Pinned Announcement</span>
        </div>
      )}

      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900 mb-2">{announcement.title}</h3>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                <span>{announcement.author_name || 'Advisor'}</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <span>{formatDate(announcement.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Target audience badge */}
          {announcement.target_audience !== 'all_students' && (
            <div className="ml-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                {announcement.target_audience === 'specific_quest' ? 'Quest Specific' : 'Targeted'}
              </span>
            </div>
          )}
        </div>

        {/* Content with markdown rendering */}
        <div className="prose prose-sm max-w-none text-gray-700 mb-4">
          <ReactMarkdown>{announcement.content}</ReactMarkdown>
        </div>

        {/* Footer with expiration info */}
        {announcement.expires_at && (
          <div className={`mt-4 pt-4 border-t border-gray-200 flex items-center gap-2 text-sm ${isExpiringSoon() ? 'text-orange-600' : 'text-gray-500'}`}>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
            </svg>
            <span>
              {isExpiringSoon()
                ? `Expires in ${Math.floor((new Date(announcement.expires_at) - new Date()) / (1000 * 60 * 60))} hours`
                : `Expires ${new Date(announcement.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              }
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnouncementCard;
