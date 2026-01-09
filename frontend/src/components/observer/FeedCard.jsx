import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../../contexts/AuthContext';
import { observerAPI } from '../../services/api';
import {
  HeartIcon,
  ChatBubbleLeftIcon,
  PhotoIcon,
  LinkIcon,
  VideoCameraIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';

// Pillar colors mapping
const PILLAR_COLORS = {
  art: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
  stem: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  wellness: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
  communication: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' },
  civics: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' }
};

const MAX_COMMENT_LENGTH = 280;

const FeedCard = ({ item, showStudentName = true, isStudentView = false }) => {
  const { user } = useAuth();
  const [liked, setLiked] = useState(item.user_has_liked);
  const [likesCount, setLikesCount] = useState(item.likes_count);
  const [isLiking, setIsLiking] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsCount, setCommentsCount] = useState(item.comments_count || 0);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deletingCommentId, setDeletingCommentId] = useState(null);

  const completionId = item.completion_id || item.id;

  useEffect(() => {
    if (commentsExpanded && comments.length === 0) {
      loadComments();
    }
  }, [commentsExpanded]);

  const loadComments = async () => {
    setLoadingComments(true);
    try {
      const response = await observerAPI.getCompletionComments(completionId);
      setComments(response.data.comments || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleLike = async () => {
    if (isLiking) return;

    setIsLiking(true);
    const wasLiked = liked;
    const prevCount = likesCount;

    // Optimistic update
    setLiked(!wasLiked);
    setLikesCount(wasLiked ? prevCount - 1 : prevCount + 1);

    try {
      await observerAPI.toggleLike(completionId);
    } catch (err) {
      // Revert on error
      setLiked(wasLiked);
      setLikesCount(prevCount);
      console.error('Failed to toggle like:', err);
    } finally {
      setIsLiking(false);
    }
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || submitting || isStudentView) return;

    if (newComment.length > MAX_COMMENT_LENGTH) {
      setError(`Comment must be ${MAX_COMMENT_LENGTH} characters or less`);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await observerAPI.postComment(
        item.student.id,
        completionId,
        newComment.trim(),
        item.quest?.id
      );
      setNewComment('');
      setCommentsCount(prev => prev + 1);
      // Reload comments to show the new one
      await loadComments();
    } catch (err) {
      const errorData = err.response?.data?.error;
      const errorMessage = typeof errorData === 'string'
        ? errorData
        : errorData?.message || 'Failed to post comment';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (deletingCommentId) return;

    setDeletingCommentId(commentId);
    try {
      await observerAPI.deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
      setCommentsCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to delete comment:', err);
      setError('Failed to delete comment');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const canDeleteComment = (comment) => {
    if (!user) return false;
    // Can delete if user is the comment author or superadmin
    return comment.observer_id === user.id || user.role === 'superadmin';
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getObserverName = (observer) => {
    if (!observer) return 'Observer';
    return observer.display_name ||
      `${observer.first_name || ''} ${observer.last_name || ''}`.trim() ||
      'Observer';
  };

  const pillarColors = item.task?.pillar ? PILLAR_COLORS[item.task.pillar.toLowerCase()] : null;
  const remainingChars = MAX_COMMENT_LENGTH - newComment.length;
  const isOverLimit = remainingChars < 0;

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-gray-100">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Student Avatar */}
          {showStudentName && (
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
              {item.student?.display_name?.charAt(0) || '?'}
            </div>
          )}

          <div className="flex-1 min-w-0">
            {showStudentName && (
              <p className="font-semibold text-gray-900 truncate text-sm sm:text-base">
                {item.student?.display_name}
              </p>
            )}
            <p className="text-xs sm:text-sm text-gray-500 truncate">
              Completed a task in <span className="font-medium text-gray-700">{item.quest?.title}</span>
            </p>
          </div>

          <span className="text-xs text-gray-400 shrink-0">
            {formatTimestamp(item.timestamp)}
          </span>
        </div>
      </div>

      {/* Task Info */}
      <div className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-base sm:text-lg mb-1">
              {item.task?.title || 'Task Completed'}
            </h3>

            {/* Pillar Badge & XP */}
            <div className="flex items-center gap-2 flex-wrap">
              {pillarColors && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${pillarColors.bg} ${pillarColors.text}`}>
                  {item.task?.pillar}
                </span>
              )}
              <span className="text-xs sm:text-sm text-gray-600">
                +{item.xp_awarded || item.task?.xp_value || 0} XP
              </span>
            </div>
          </div>
        </div>

        {/* Evidence Preview */}
        {item.evidence && (
          <div className="mt-3 sm:mt-4">
            {item.evidence.type === 'image' && item.evidence.url && (
              <div className="rounded-lg overflow-hidden bg-gray-100">
                <img
                  src={item.evidence.url}
                  alt="Task evidence"
                  className="w-full max-h-72 sm:max-h-96 object-contain"
                  loading="lazy"
                />
              </div>
            )}

            {item.evidence.type === 'video' && item.evidence.url && (
              <div className="rounded-lg overflow-hidden bg-gray-900 aspect-video">
                {item.evidence.url.includes('youtube.com') || item.evidence.url.includes('youtu.be') ? (
                  <iframe
                    src={item.evidence.url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                    className="w-full h-full"
                    allowFullScreen
                    title="Video evidence"
                  />
                ) : (
                  <a
                    href={item.evidence.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center h-full text-white hover:text-gray-300 min-h-[120px]"
                  >
                    <VideoCameraIcon className="w-10 h-10 sm:w-12 sm:h-12" />
                    <span className="ml-2 text-sm sm:text-base">Watch Video</span>
                  </a>
                )}
              </div>
            )}

            {item.evidence.type === 'text' && item.evidence.preview_text && (
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
                <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap">
                  {item.evidence.preview_text}
                </p>
              </div>
            )}

            {item.evidence.type === 'link' && item.evidence.url && (
              <a
                href={item.evidence.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 active:bg-gray-150 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-5 h-5 shrink-0 text-blue-600" />
                  <span className="text-sm sm:text-base font-medium text-blue-600 truncate">
                    {item.evidence.title || (() => {
                      try {
                        const url = new URL(item.evidence.url);
                        return url.hostname.replace('www.', '');
                      } catch {
                        return 'View Link';
                      }
                    })()}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-1 pl-7">
                  {item.evidence.url}
                </p>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Actions - Larger touch targets for mobile */}
      <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-gray-100 flex items-center gap-2 sm:gap-4">
        <button
          onClick={handleLike}
          disabled={isLiking}
          className={`flex items-center gap-1.5 px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-full transition-colors min-h-[44px] ${
            liked
              ? 'bg-red-50 text-red-600 active:bg-red-100'
              : 'text-gray-500 hover:bg-gray-100 active:bg-gray-200 hover:text-gray-700'
          }`}
        >
          {liked ? (
            <HeartIconSolid className="w-5 h-5 sm:w-5 sm:h-5" />
          ) : (
            <HeartIcon className="w-5 h-5 sm:w-5 sm:h-5" />
          )}
          <span className="text-sm font-medium">{likesCount || ''}</span>
        </button>

        <button
          onClick={() => setCommentsExpanded(!commentsExpanded)}
          className={`flex items-center gap-1.5 px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-full transition-colors min-h-[44px] ${
            commentsExpanded
              ? 'bg-gray-100 text-gray-700 active:bg-gray-200'
              : 'text-gray-500 hover:bg-gray-100 active:bg-gray-200 hover:text-gray-700'
          }`}
        >
          <ChatBubbleLeftIcon className="w-5 h-5 sm:w-5 sm:h-5" />
          <span className="text-sm font-medium">{commentsCount || ''}</span>
        </button>
      </div>

      {/* Inline Comments Section */}
      {commentsExpanded && (
        <div className="border-t border-gray-100 bg-gray-50">
          {/* Comment Input (only for observers, not students) */}
          {!isStudentView && (
            <form onSubmit={handleSubmitComment} className="p-3 border-b border-gray-100 bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Leave an encouraging comment..."
                  className={`flex-1 px-3 py-3 text-base sm:text-sm border rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent ${
                    isOverLimit ? 'border-red-500' : 'border-gray-300'
                  }`}
                  disabled={submitting}
                  maxLength={MAX_COMMENT_LENGTH + 50}
                />
                <button
                  type="submit"
                  disabled={submitting || isOverLimit || !newComment.trim()}
                  className="px-4 py-3 sm:px-3 sm:py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed min-w-[48px] flex items-center justify-center"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              </div>
              {isOverLimit && (
                <p className="text-xs text-red-500 mt-1">{remainingChars} characters</p>
              )}
              {error && (
                <p className="text-xs text-red-500 mt-1">{error}</p>
              )}
            </form>
          )}

          {/* Comments List */}
          <div className="max-h-64 overflow-y-auto">
            {loadingComments ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                Loading comments...
              </div>
            ) : comments.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {comments.map(c => (
                  <div key={c.id} className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {getObserverName(c.observer).charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">
                            {getObserverName(c.observer)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatTimestamp(c.created_at)}
                          </span>
                          {canDeleteComment(c) && (
                            <button
                              onClick={() => handleDeleteComment(c.id)}
                              disabled={deletingCommentId === c.id}
                              className="ml-auto p-2 -mr-1 text-gray-400 hover:text-red-500 active:text-red-600 transition-colors disabled:opacity-50 min-w-[36px] min-h-[36px] flex items-center justify-center"
                              title="Delete comment"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <p className="text-gray-700 text-sm mt-0.5 break-words">
                          {c.comment_text}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500 text-sm">
                {isStudentView ? 'No comments yet' : 'No comments yet. Be the first to encourage!'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

FeedCard.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    completion_id: PropTypes.string,
    type: PropTypes.string,
    timestamp: PropTypes.string.isRequired,
    student: PropTypes.shape({
      id: PropTypes.string,
      display_name: PropTypes.string,
      avatar_url: PropTypes.string
    }),
    task: PropTypes.shape({
      id: PropTypes.string,
      title: PropTypes.string,
      pillar: PropTypes.string,
      xp_value: PropTypes.number
    }),
    quest: PropTypes.shape({
      id: PropTypes.string,
      title: PropTypes.string
    }),
    evidence: PropTypes.shape({
      type: PropTypes.string,
      url: PropTypes.string,
      preview_text: PropTypes.string
    }),
    xp_awarded: PropTypes.number,
    likes_count: PropTypes.number,
    comments_count: PropTypes.number,
    user_has_liked: PropTypes.bool
  }).isRequired,
  showStudentName: PropTypes.bool,
  isStudentView: PropTypes.bool
};

export default FeedCard;
