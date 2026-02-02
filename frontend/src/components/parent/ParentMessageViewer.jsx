import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import api from '../../services/api';

/**
 * ParentMessageViewer - Read-only view of conversation messages.
 * Shows messages from DMs, Groups, or AI Tutor conversations.
 */
const ParentMessageViewer = ({ studentId, conversation, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const messagesEndRef = useRef(null);
  const LIMIT = 50;

  useEffect(() => {
    fetchMessages();
  }, [studentId, conversation]);

  const fetchMessages = async (loadMore = false) => {
    try {
      if (!loadMore) {
        setLoading(true);
        setOffset(0);
      }
      setError(null);

      const currentOffset = loadMore ? offset : 0;
      let endpoint = '';

      switch (conversation.type) {
        case 'dm':
          endpoint = `/api/parent/student/${studentId}/dm-conversations/${conversation.id}/messages`;
          break;
        case 'group':
          endpoint = `/api/parent/student/${studentId}/group-conversations/${conversation.id}/messages`;
          break;
        case 'tutor':
          endpoint = `/api/parent/student/${studentId}/tutor-conversations/${conversation.id}/messages`;
          break;
        default:
          throw new Error('Unknown conversation type');
      }

      const response = await api.get(endpoint, {
        params: { limit: LIMIT, offset: currentOffset }
      });

      if (response.data.success) {
        const newMessages = response.data.messages || [];
        // Messages come in desc order, reverse for display
        newMessages.reverse();

        if (loadMore) {
          setMessages(prev => [...newMessages, ...prev]);
        } else {
          setMessages(newMessages);
        }

        setHasMore(newMessages.length === LIMIT);
        setOffset(currentOffset + newMessages.length);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getMessageSender = (message) => {
    if (conversation.type === 'tutor') {
      return message.role === 'user' ? 'Student' : 'AI Tutor';
    }
    const sender = message.sender || {};
    return sender.display_name || `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || 'Unknown';
  };

  const isStudentMessage = (message) => {
    if (conversation.type === 'tutor') {
      return message.role === 'user';
    }
    return message.sender_id === studentId;
  };

  const getTypeIcon = () => {
    switch (conversation.type) {
      case 'dm':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      case 'group':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      case 'tutor':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      default:
        return null;
    }
  };

  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="h-5 bg-gray-200 rounded w-32 animate-pulse"></div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[400px]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200 bg-white">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          conversation.type === 'tutor'
            ? 'bg-gradient-to-br from-optio-purple to-optio-pink text-white'
            : 'bg-gray-100 text-gray-600'
        }`}>
          {conversation.avatar_url ? (
            <img src={conversation.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            getTypeIcon()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{conversation.name}</h3>
          <p className="text-xs text-gray-500">
            {conversation.type === 'dm' ? 'Direct Message' :
             conversation.type === 'group' ? 'Group Chat' : 'AI Tutor'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {error ? (
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => fetchMessages()}
              className="px-4 py-2 bg-optio-purple text-white rounded-lg hover:bg-optio-purple/90"
            >
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No messages in this conversation
          </div>
        ) : (
          <>
            {/* Load more button */}
            {hasMore && (
              <div className="text-center">
                <button
                  onClick={() => fetchMessages(true)}
                  className="text-sm text-optio-purple hover:underline"
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Load older messages'}
                </button>
              </div>
            )}

            {/* Messages list */}
            {messages.map((message, index) => (
              <div
                key={message.id || index}
                className={`flex ${isStudentMessage(message) ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    isStudentMessage(message)
                      ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-br-sm'
                      : conversation.type === 'tutor' && message.role === 'assistant'
                        ? 'bg-gray-200 text-gray-800 rounded-bl-sm'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                  }`}
                >
                  {/* Show sender name for group chats */}
                  {conversation.type === 'group' && !isStudentMessage(message) && (
                    <p className="text-xs font-medium mb-1 opacity-80">
                      {getMessageSender(message)}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                  <p className={`text-xs mt-1 ${
                    isStudentMessage(message) ? 'text-white/70' : 'text-gray-400'
                  }`}>
                    {formatTime(message.created_at)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Read-only footer */}
      <div className="p-4 bg-gray-100 border-t border-gray-200 text-center">
        <p className="text-sm text-gray-500 flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Read-only view - Parents cannot send messages
        </p>
      </div>
    </div>
  );
};

ParentMessageViewer.propTypes = {
  studentId: PropTypes.string.isRequired,
  conversation: PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.oneOf(['dm', 'group', 'tutor']).isRequired,
    name: PropTypes.string,
    avatar_url: PropTypes.string
  }).isRequired,
  onBack: PropTypes.func.isRequired
};

export default ParentMessageViewer;
