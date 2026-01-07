import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { observerAPI } from '../../services/api';
import { Modal, Alert } from '../ui';
import { ChatBubbleLeftIcon } from '@heroicons/react/24/outline';

const MAX_COMMENT_LENGTH = 280;

const CommentModal = ({ isOpen, onClose, completionItem, onCommentPosted }) => {
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && completionItem?.id) {
      loadComments();
    }
  }, [isOpen, completionItem?.id]);

  const loadComments = async () => {
    setLoading(true);
    try {
      // Use completion_id for API calls (id may be compound: completion_id_block_id)
      const completionId = completionItem.completion_id || completionItem.id;
      const response = await observerAPI.getCompletionComments(completionId);
      setComments(response.data.comments || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!comment.trim()) {
      setError('Please enter a comment');
      return;
    }

    if (comment.length > MAX_COMMENT_LENGTH) {
      setError(`Comment must be ${MAX_COMMENT_LENGTH} characters or less`);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Use completion_id for API calls (id may be compound: completion_id_block_id)
      const completionId = completionItem.completion_id || completionItem.id;
      await observerAPI.postComment(
        completionItem.student.id,
        completionId,
        comment.trim(),
        completionItem.quest?.id
      );

      setComment('');
      loadComments();

      if (onCommentPosted) {
        onCommentPosted();
      }
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

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const remainingChars = MAX_COMMENT_LENGTH - comment.length;
  const isOverLimit = remainingChars < 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Comments"
      size="md"
    >
      <div className="space-y-4">
        {/* Task Context */}
        {completionItem && (
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <p className="text-sm text-gray-600">
              Commenting on <span className="font-semibold text-gray-900">{completionItem.task?.title}</span>
              {' '}by {completionItem.student?.display_name}
            </p>
          </div>
        )}

        {/* Encouragement Tip */}
        <Alert variant="info">
          <p className="text-sm">
            Focus on effort and process, not just results. Try: "I can see how much thought you put into this!" or "What inspired you to approach it this way?"
          </p>
        </Alert>

        {/* Comment Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Leave an encouraging comment..."
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none ${
                isOverLimit ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={submitting}
            />
            <div className="flex justify-between mt-1">
              <span className={`text-xs ${isOverLimit ? 'text-red-500' : 'text-gray-400'}`}>
                {remainingChars} characters remaining
              </span>
            </div>
          </div>

          {error && (
            <Alert variant="error">
              {error}
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || isOverLimit || !comment.trim()}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </form>

        {/* Existing Comments */}
        {loading ? (
          <div className="text-center py-4 text-gray-500">
            Loading comments...
          </div>
        ) : comments.length > 0 ? (
          <div className="space-y-3 border-t border-gray-200 pt-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <ChatBubbleLeftIcon className="w-4 h-4" />
              Previous Comments ({comments.length})
            </h4>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {comments.map(c => (
                <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 text-sm">
                      {c.observer?.display_name ||
                        `${c.observer?.first_name || ''} ${c.observer?.last_name || ''}`.trim() ||
                        'Observer'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTimestamp(c.created_at)}
                    </span>
                  </div>
                  <p className="text-gray-700 text-sm whitespace-pre-wrap">
                    {c.comment_text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 border-t border-gray-200">
            <ChatBubbleLeftIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No comments yet. Be the first to encourage!</p>
          </div>
        )}
      </div>
    </Modal>
  );
};

CommentModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  completionItem: PropTypes.object,
  onCommentPosted: PropTypes.func
};

export default CommentModal;
