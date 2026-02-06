import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../../contexts/AuthContext';
import { observerAPI } from '../../services/api';
import {
  HeartIcon,
  ChatBubbleLeftIcon,
  LinkIcon,
  VideoCameraIcon,
  PaperAirplaneIcon,
  TrashIcon,
  DocumentIcon,
  UserCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import { HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid';

// Pillar colors mapping
const PILLAR_COLORS = {
  art: { bg: 'bg-pink-100', text: 'text-pink-700' },
  stem: { bg: 'bg-blue-100', text: 'text-blue-700' },
  wellness: { bg: 'bg-green-100', text: 'text-green-700' },
  communication: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  civics: { bg: 'bg-purple-100', text: 'text-purple-700' }
};

const MAX_COMMENT_LENGTH = 280;
const TEXT_PREVIEW_LENGTH = 150;

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
  const [textExpanded, setTextExpanded] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);

  const isLearningMoment = item.type === 'learning_moment';
  const completionId = !isLearningMoment ? (item.completion_id || item.id) : null;
  const learningEventId = isLearningMoment ? item.learning_event_id : null;

  // Either completionId or learningEventId must be present for social features
  const hasSocialTarget = completionId || learningEventId;

  useEffect(() => {
    if (commentsExpanded && comments.length === 0 && hasSocialTarget) {
      loadComments();
    }
  }, [commentsExpanded]);

  const loadComments = async () => {
    if (!hasSocialTarget) return;
    setLoadingComments(true);
    try {
      const response = isLearningMoment
        ? await observerAPI.getLearningEventComments(learningEventId)
        : await observerAPI.getCompletionComments(completionId);
      setComments(response.data.comments || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleLike = async () => {
    if (isLiking || !hasSocialTarget) return;
    setIsLiking(true);
    const wasLiked = liked;
    const prevCount = likesCount;
    setLiked(!wasLiked);
    setLikesCount(wasLiked ? prevCount - 1 : prevCount + 1);
    try {
      if (isLearningMoment) {
        await observerAPI.toggleLearningEventLike(learningEventId);
      } else {
        await observerAPI.toggleLike(completionId);
      }
    } catch (err) {
      setLiked(wasLiked);
      setLikesCount(prevCount);
      console.error('Failed to toggle like:', err);
    } finally {
      setIsLiking(false);
    }
  };

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || submitting || isStudentView || !hasSocialTarget) return;
    if (newComment.length > MAX_COMMENT_LENGTH) {
      setError(`Comment must be ${MAX_COMMENT_LENGTH} characters or less`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (isLearningMoment) {
        await observerAPI.postLearningEventComment(
          item.student.id,
          learningEventId,
          newComment.trim()
        );
      } else {
        await observerAPI.postComment(
          item.student.id,
          completionId,
          newComment.trim(),
          item.quest?.id
        );
      }
      setNewComment('');
      setCommentsCount(prev => prev + 1);
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
    // Comment author can delete their own comment
    if (comment.observer_id === user.id) return true;
    // Superadmin can delete any comment
    if (user.role === 'superadmin') return true;
    // Parents can delete comments on their children's work
    // (Parents can only view their own children's feed, so if they see it, they're the parent)
    if (user.role === 'parent') return true;
    return false;
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
  const momentPillars = item.moment?.pillars || [];
  const topicName = item.moment?.topic_name;
  const remainingChars = MAX_COMMENT_LENGTH - newComment.length;
  const isOverLimit = remainingChars < 0;
  const hasAvatar = item.student?.avatar_url;

  // Get description text
  const descriptionText = isLearningMoment
    ? item.moment?.description
    : (item.evidence?.type === 'text' ? item.evidence.preview_text : null);

  const isLongText = descriptionText && descriptionText.length > TEXT_PREVIEW_LENGTH;
  const displayText = textExpanded || !isLongText
    ? descriptionText
    : descriptionText.slice(0, TEXT_PREVIEW_LENGTH) + '...';

  // Check if we have media evidence (not text-only)
  const hasMediaEvidence = item.evidence && item.evidence.type !== 'text' && item.evidence.url;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mx-2 sm:mx-0">
      {/* 1. Student name header */}
      <div className="px-4 py-3 sm:px-5 sm:py-4 flex items-center gap-3">
        {showStudentName && (
          hasAvatar ? (
            <img
              src={item.student.avatar_url}
              alt={item.student?.display_name || 'Student'}
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover shrink-0"
            />
          ) : (
            <UserCircleIcon className="w-10 h-10 sm:w-12 sm:h-12 text-purple-300 shrink-0" />
          )
        )}
        <div className="flex-1 min-w-0">
          {showStudentName && (
            <p className="font-semibold text-gray-900 truncate text-sm sm:text-base">
              {item.student?.display_name}
            </p>
          )}
          {/* 2. "completed a task in {quest}" or "captured a learning moment" */}
          <p className="text-xs sm:text-sm text-gray-500 truncate">
            {isLearningMoment ? (
              item.moment?.source_type === 'parent_captured' ? (
                <span>Learning moment captured by parent</span>
              ) : (
                <span>Captured a learning moment</span>
              )
            ) : (
              <>Completed a task in <span className="font-medium text-gray-700">{item.quest?.title}</span></>
            )}
          </p>
        </div>
        <span className="text-xs text-gray-400 shrink-0">
          {formatTimestamp(item.timestamp)}
        </span>
      </div>

      {/* 3. Task name / Learning moment title */}
      {/* 4. Pill icon (pillar/topic) */}
      <div className="px-4 sm:px-5 pb-3">
        <h3 className="font-semibold text-gray-900 text-base sm:text-lg">
          {isLearningMoment
            ? (item.moment?.title || 'Learning Moment')
            : (item.task?.title || 'Task Completed')}
        </h3>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {isLearningMoment ? (
            topicName ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                {topicName}
              </span>
            ) : momentPillars.length > 0 ? (
              momentPillars.map(pillar => {
                const colors = PILLAR_COLORS[pillar.toLowerCase()];
                return colors ? (
                  <span key={pillar} className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                    {pillar}
                  </span>
                ) : null;
              })
            ) : null
          ) : (
            <>
              {pillarColors && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${pillarColors.bg} ${pillarColors.text}`}>
                  {item.task?.pillar}
                </span>
              )}
              <span className="text-sm text-gray-600">
                +{item.xp_awarded || item.task?.xp_value || 0} XP
              </span>
            </>
          )}
        </div>
      </div>

      {/* 5. Evidence (image, video, link, doc, text) */}
      {hasMediaEvidence && (
        <div className="bg-gray-100">
          {item.evidence.type === 'image' && (
            <img
              src={item.evidence.url}
              alt="Evidence"
              className="w-full max-h-[600px] object-contain"
              loading="lazy"
            />
          )}
          {item.evidence.type === 'video' && (
            <div className="aspect-video bg-gray-900">
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
                  className="flex items-center justify-center h-full text-white hover:text-gray-300 min-h-[200px]"
                >
                  <VideoCameraIcon className="w-12 h-12" />
                  <span className="ml-2">Watch Video</span>
                </a>
              )}
            </div>
          )}
          {item.evidence.type === 'link' && (
            <a
              href={item.evidence.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <LinkIcon className="w-6 h-6 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <span className="text-base font-medium text-blue-600 block truncate">
                    {item.evidence.title || (() => {
                      try {
                        return new URL(item.evidence.url).hostname.replace('www.', '');
                      } catch {
                        return 'View Link';
                      }
                    })()}
                  </span>
                  <p className="text-sm text-gray-500 truncate">{item.evidence.url}</p>
                </div>
              </div>
            </a>
          )}
          {item.evidence.type === 'document' && (
            <a
              href={item.evidence.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <DocumentIcon className="w-6 h-6 shrink-0 text-orange-600" />
                <span className="text-base font-medium text-orange-600">
                  {item.evidence.title || 'View Document'}
                </span>
              </div>
            </a>
          )}
        </div>
      )}

      {/* Text evidence or learning moment description */}
      {descriptionText && (
        <div className="px-4 sm:px-5 py-3 border-t border-gray-100">
          <p className="text-sm sm:text-base text-gray-700 whitespace-pre-wrap">
            {displayText}
          </p>
          {isLongText && (
            <button
              onClick={() => setTextExpanded(!textExpanded)}
              className="text-sm text-gray-500 hover:text-gray-700 mt-1 flex items-center gap-1"
            >
              {textExpanded ? (
                <>Show less <ChevronUpIcon className="w-4 h-4" /></>
              ) : (
                <>Show more <ChevronDownIcon className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
      )}

      {/* 6. Like/comment buttons */}
      <div className="px-4 sm:px-5 py-2 border-t border-gray-100 flex items-center gap-4">
        <button
          onClick={handleLike}
          disabled={isLiking}
          className={`flex items-center gap-1 p-2 transition-colors ${liked ? 'text-red-500' : 'text-gray-700 hover:text-gray-500'}`}
        >
          {liked ? <HeartIconSolid className="w-6 h-6" /> : <HeartIcon className="w-6 h-6" />}
          {likesCount > 0 && <span className="text-sm">{likesCount}</span>}
        </button>
        <button
          onClick={() => setCommentsExpanded(!commentsExpanded)}
          className="flex items-center gap-1 p-2 text-gray-700 hover:text-gray-500 transition-colors"
        >
          <ChatBubbleLeftIcon className="w-6 h-6" />
          {commentsCount > 0 && <span className="text-sm">{commentsCount}</span>}
        </button>
      </div>

      {/* 7. Previous comments */}
      {commentsExpanded && (
        <div className="border-t border-gray-100 bg-gray-50">
          {!isStudentView && (
            <form onSubmit={handleSubmitComment} className="p-3 sm:p-4 border-b border-gray-100 bg-white">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Leave an encouraging comment..."
                  className={`flex-1 px-3 py-3 text-base border rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent ${
                    isOverLimit ? 'border-red-500' : 'border-gray-300'
                  }`}
                  disabled={submitting}
                  maxLength={MAX_COMMENT_LENGTH + 50}
                />
                <button
                  type="submit"
                  disabled={submitting || isOverLimit || !newComment.trim()}
                  className="px-4 py-3 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed min-w-[48px] flex items-center justify-center"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              </div>
              {isOverLimit && <p className="text-xs text-red-500 mt-1">{remainingChars} characters</p>}
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </form>
          )}
          <div className={showAllComments ? "max-h-64 overflow-y-auto" : ""}>
            {loadingComments ? (
              <div className="p-4 text-center text-gray-500 text-sm">Loading comments...</div>
            ) : comments.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {(showAllComments ? comments : comments.slice(0, 3)).map(c => (
                  <div key={c.id} className="p-3 sm:p-4">
                    <div className="flex items-start gap-2">
                      {c.observer?.avatar_url ? (
                        <img
                          src={c.observer.avatar_url}
                          alt={getObserverName(c.observer)}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <UserCircleIcon className="w-8 h-8 text-gray-400 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">{getObserverName(c.observer)}</span>
                          <span className="text-xs text-gray-400">{formatTimestamp(c.created_at)}</span>
                          {canDeleteComment(c) && (
                            <button
                              onClick={() => handleDeleteComment(c.id)}
                              disabled={deletingCommentId === c.id}
                              className="ml-auto p-2 -mr-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 min-w-[36px] min-h-[36px] flex items-center justify-center"
                              title="Delete comment"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <p className="text-gray-700 text-sm mt-0.5 break-words">{c.comment_text}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {comments.length > 3 && (
                  <button
                    onClick={() => setShowAllComments(!showAllComments)}
                    className="w-full p-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors flex items-center justify-center gap-1"
                  >
                    {showAllComments ? (
                      <>Show less <ChevronUpIcon className="w-4 h-4" /></>
                    ) : (
                      <>View {comments.length - 3} more comment{comments.length - 3 !== 1 ? 's' : ''} <ChevronDownIcon className="w-4 h-4" /></>
                    )}
                  </button>
                )}
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
    learning_event_id: PropTypes.string,
    type: PropTypes.oneOf(['task_completed', 'learning_moment']),
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
    moment: PropTypes.shape({
      title: PropTypes.string,
      description: PropTypes.string,
      pillars: PropTypes.arrayOf(PropTypes.string),
      topic_name: PropTypes.string,
      source_type: PropTypes.string,
      captured_by_user_id: PropTypes.string
    }),
    evidence: PropTypes.shape({
      type: PropTypes.string,
      url: PropTypes.string,
      preview_text: PropTypes.string,
      title: PropTypes.string
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
