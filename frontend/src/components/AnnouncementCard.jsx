import React from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * AnnouncementCard
 *
 * Displays a single announcement in a compact clickable format.
 * Shows pinned status, unread indicator, and basic info.
 */
const AnnouncementCard = ({ announcement, isPinned = false, isUnread = false, onClick }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      const minutes = Math.floor(diffInHours * 60);
      return `${minutes}m ago`;
    } else if (diffInHours < 24) {
      const hours = Math.floor(diffInHours);
      return `${hours}h ago`;
    } else if (diffInHours < 168) {
      const days = Math.floor(diffInHours / 24);
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // Get preview of message (first 100 chars, strip markdown)
  const getPreview = (content) => {
    if (!content) return '';
    const stripped = content.replace(/[#*_`~\[\]]/g, '').replace(/\n/g, ' ');
    return stripped.length > 100 ? stripped.substring(0, 100) + '...' : stripped;
  };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white rounded-lg border transition-all hover:shadow-md hover:border-optio-purple/30 ${
        isPinned ? 'border-optio-purple/50' : 'border-gray-200'
      } ${isUnread ? 'bg-optio-purple/5' : ''}`}
    >
      <div className="p-4 flex items-start gap-3">
        {/* Unread indicator */}
        {isUnread && (
          <div className="flex-shrink-0 mt-1.5">
            <div className="w-2 h-2 rounded-full bg-optio-purple" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isPinned && (
              <svg className="w-4 h-4 text-optio-purple flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L11 4.323V3a1 1 0 011-1h-2zM9 5.323V3a1 1 0 00-1-1H6a1 1 0 00-1 1v2.323l-3.954 1.582-1.599-.8a1 1 0 10-.894 1.79l1.233.616-1.738 5.42a1 1 0 00.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 012.667-1.019 1 1 0 00.285-1.05l-1.738-5.42 1.233-.617a1 1 0 10-.894-1.788l-1.599.799L9 5.323z" />
              </svg>
            )}
            <h3 className={`font-semibold text-gray-900 truncate ${isUnread ? 'font-bold' : ''}`}>
              {announcement.title}
            </h3>
          </div>
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
            {getPreview(announcement.message || announcement.content)}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{announcement.author_name || 'Advisor'}</span>
            <span>•</span>
            <span>{formatDate(announcement.created_at)}</span>
          </div>
        </div>

        {/* Chevron */}
        <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
};

/**
 * AnnouncementModal
 *
 * Full announcement view in a modal dialog.
 * Supports delete functionality for org_admins and authors.
 */
export const AnnouncementModal = ({ announcement, isOpen, onClose, onDelete, canDelete = false }) => {
  if (!isOpen || !announcement) return null;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this announcement?')) {
      onDelete?.(announcement.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        {/* Modal */}
        <div
          className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between">
            <div className="flex-1 pr-4">
              <div className="flex items-center gap-2 mb-1">
                {announcement.pinned && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-optio-purple/10 text-optio-purple">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L11 4.323V3a1 1 0 011-1h-2zM9 5.323V3a1 1 0 00-1-1H6a1 1 0 00-1 1v2.323l-3.954 1.582-1.599-.8a1 1 0 10-.894 1.79l1.233.616-1.738 5.42a1 1 0 00.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 012.667-1.019 1 1 0 00.285-1.05l-1.738-5.42 1.233-.617a1 1 0 10-.894-1.788l-1.599.799L9 5.323z" />
                    </svg>
                    Pinned
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-gray-900">{announcement.title}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                <span>{announcement.author_name || 'Advisor'}</span>
                <span>•</span>
                <span>{formatDate(announcement.created_at)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canDelete && (
                <button
                  onClick={handleDelete}
                  className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                  title="Delete announcement"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
            <div className="prose prose-sm max-w-none text-gray-700">
              <ReactMarkdown>{announcement.message || announcement.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementCard;
