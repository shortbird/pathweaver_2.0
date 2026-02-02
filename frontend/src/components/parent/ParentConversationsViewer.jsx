import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import api from '../../services/api';
import ParentMessageViewer from './ParentMessageViewer';

/**
 * ParentConversationsViewer - Read-only view of student's conversations.
 * Shows DMs, Groups, and AI Tutor conversations.
 */
const ParentConversationsViewer = ({ studentId }) => {
  const [conversations, setConversations] = useState([]);
  const [counts, setCounts] = useState({ dm: 0, group: 0, tutor: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedConversation, setSelectedConversation] = useState(null);

  useEffect(() => {
    fetchConversations();
  }, [studentId]);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/api/parent/student/${studentId}/conversations/all`);
      if (response.data.success) {
        setConversations(response.data.conversations || []);
        setCounts(response.data.counts || { dm: 0, group: 0, tutor: 0 });
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setError('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const filteredConversations = activeTab === 'all'
    ? conversations
    : conversations.filter(c => c.type === activeTab);

  const getTypeIcon = (type) => {
    switch (type) {
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

  const getTypeLabel = (type) => {
    switch (type) {
      case 'dm': return 'Direct Message';
      case 'group': return 'Group Chat';
      case 'tutor': return 'AI Tutor';
      default: return type;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // If a conversation is selected, show the message viewer
  if (selectedConversation) {
    return (
      <ParentMessageViewer
        studentId={studentId}
        conversation={selectedConversation}
        onBack={() => setSelectedConversation(null)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchConversations}
          className="px-4 py-2 bg-optio-purple text-white rounded-lg hover:bg-optio-purple/90"
        >
          Retry
        </button>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p>No conversations found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
            activeTab === 'all'
              ? 'bg-optio-purple text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          All ({conversations.length})
        </button>
        <button
          onClick={() => setActiveTab('dm')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'dm'
              ? 'bg-optio-purple text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {getTypeIcon('dm')}
          DMs ({counts.dm})
        </button>
        <button
          onClick={() => setActiveTab('group')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'group'
              ? 'bg-optio-purple text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {getTypeIcon('group')}
          Groups ({counts.group})
        </button>
        <button
          onClick={() => setActiveTab('tutor')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'tutor'
              ? 'bg-optio-purple text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {getTypeIcon('tutor')}
          AI Tutor ({counts.tutor})
        </button>
      </div>

      {/* Conversation List */}
      <div className="space-y-2">
        {filteredConversations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No {activeTab === 'all' ? '' : getTypeLabel(activeTab).toLowerCase()} conversations found
          </div>
        ) : (
          filteredConversations.map((conversation) => (
            <button
              key={`${conversation.type}-${conversation.id}`}
              onClick={() => setSelectedConversation(conversation)}
              className="w-full flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200 hover:border-optio-purple hover:shadow-sm transition-all text-left"
            >
              {/* Avatar/Icon */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                conversation.type === 'tutor'
                  ? 'bg-gradient-to-br from-optio-purple to-optio-pink text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {conversation.avatar_url ? (
                  <img src={conversation.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  getTypeIcon(conversation.type)
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">{conversation.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    conversation.type === 'dm' ? 'bg-blue-100 text-blue-700' :
                    conversation.type === 'group' ? 'bg-green-100 text-green-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {getTypeLabel(conversation.type)}
                  </span>
                </div>
                {conversation.last_message_preview && (
                  <p className="text-sm text-gray-500 truncate">{conversation.last_message_preview}</p>
                )}
              </div>

              {/* Time */}
              <div className="flex-shrink-0 text-xs text-gray-400">
                {formatDate(conversation.last_message_at)}
              </div>

              {/* Arrow */}
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))
        )}
      </div>

      {/* Read-only notice */}
      <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
        <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        Read-only view of your child's communications
      </div>
    </div>
  );
};

ParentConversationsViewer.propTypes = {
  studentId: PropTypes.string.isRequired
};

export default ParentConversationsViewer;
