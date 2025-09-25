import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Bot, User, AlertTriangle, MessageSquare } from 'lucide-react';
import api from '../../services/api';

const CONVERSATION_MODES = [
  { value: 'study_buddy', label: 'Study Buddy', description: 'Casual and encouraging' },
  { value: 'teacher', label: 'Teacher', description: 'Structured lessons' },
  { value: 'discovery', label: 'Explorer', description: 'Question-based learning' },
  { value: 'review', label: 'Reviewer', description: 'Review and practice' },
  { value: 'creative', label: 'Creator', description: 'Creative brainstorming' }
];

const ChatInterface = ({
  conversationId = null,
  currentQuest = null,
  currentTask = null,
  onClose = null,
  selectedMode: propSelectedMode = null,
  hideHeader = false,
  className = '',
  onConversationCreate = null
}) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [internalSelectedMode, setInternalSelectedMode] = useState('study_buddy');
  const selectedMode = propSelectedMode || internalSelectedMode;
  const setSelectedMode = propSelectedMode ? () => {} : setInternalSelectedMode;
  const [usageStats, setUsageStats] = useState(null);
  const [error, setError] = useState(null);
  const [showModeSelector, setShowModeSelector] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load conversation and usage stats on mount
  useEffect(() => {
    loadConversation();
    loadUsageStats();
  }, [conversationId]);

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const loadConversation = async () => {
    try {
      if (conversationId) {
        const response = await api.get(`/api/tutor/conversations/${conversationId}`);
        setConversation(response.data.conversation);
        setMessages(response.data.messages || []);
        setSelectedMode(response.data.conversation.conversation_mode || 'study_buddy');
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
      // Don't show error to user, just start a fresh conversation instead
      if (onConversationCreate) {
        onConversationCreate(null); // Clear the conversation ID to start fresh
      }
    }
  };

  const loadUsageStats = async () => {
    try {
      const response = await api.get('/api/tutor/usage');
      setUsageStats(response.data.usage);
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const message = inputMessage.trim();
    setInputMessage('');
    setError(null);
    setIsLoading(true);

    // Add user message to UI immediately
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await api.post('/api/tutor/chat', {
        message,
        conversation_id: conversationId,
        mode: selectedMode,
        current_quest: currentQuest,
        current_task: currentTask
      });

      // Add AI response to messages
      const responseData = response.data.data || response.data;
      const aiMessage = {
        id: responseData.message_id,
        role: 'assistant',
        content: responseData.response,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiMessage]);

      // Update conversation ID if this was the first message
      if (!conversationId && responseData.conversation_id) {
        setConversation({ id: responseData.conversation_id });
        // Notify parent component about the new conversation
        if (onConversationCreate) {
          onConversationCreate(responseData.conversation_id);
        }
      }


      // Update usage stats
      await loadUsageStats();

      // Show XP bonus notification if earned
      if (responseData.xp_bonus_awarded) {
        showNotification('Great engagement! You earned bonus XP!', 'success');
      }

    } catch (error) {
      console.error('Failed to send message:', error);

      if (error.response?.status === 429) {
        setError('Daily message limit reached. Upgrade your subscription for more messages!');
      } else if (error.response?.data?.error === 'message_blocked') {
        setError('Let\'s keep our conversation focused on learning topics! Try asking about something educational.');
      } else {
        setError('Sorry, I had trouble processing that. Please try again!');
      }

      // Remove the user message that failed to send
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };


  const handleModeChange = async (newMode) => {
    setSelectedMode(newMode);
    setShowModeSelector(false);

    if (conversation?.id) {
      try {
        await api.put(`/api/tutor/conversations/${conversation.id}`, {
          conversation_mode: newMode
        });
      } catch (error) {
        console.error('Failed to update conversation mode:', error);
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const reportMessage = async (messageId) => {
    try {
      await api.post('/api/tutor/report', {
        message_id: messageId,
        reason: 'inappropriate_content',
        description: 'User reported this message'
      });
      showNotification('Report submitted. Thank you for helping keep our platform safe!', 'success');
    } catch (error) {
      console.error('Failed to report message:', error);
      showNotification('Failed to submit report. Please try again.', 'error');
    }
  };

  const showNotification = (message, type) => {
    // This would integrate with your existing notification system
    console.log(`${type.toUpperCase()}: ${message}`);
  };

  const currentModeInfo = CONVERSATION_MODES.find(mode => mode.value === selectedMode);

  return (
    <div className={`flex flex-col h-full bg-white ${hideHeader ? '' : 'rounded-lg shadow-lg'} ${className}`}>
      {/* Header - Only show if not hidden */}
      {!hideHeader && (
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-t-lg">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <Bot className="w-6 h-6 text-[#6d469b]" />
            </div>
            <div>
              <h3 className="text-white font-semibold">OptioBot</h3>
              <p className="text-white/80 text-sm">Your learning companion</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Mode Selector */}
            <div className="relative">
              <button
                onClick={() => setShowModeSelector(!showModeSelector)}
                className="bg-white/20 text-white px-3 py-1 rounded-full text-sm hover:bg-white/30 transition-colors"
              >
                {currentModeInfo?.label}
              </button>

              {showModeSelector && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border z-50">
                  <div className="p-2">
                    {CONVERSATION_MODES.map(mode => (
                      <button
                        key={mode.value}
                        onClick={() => handleModeChange(mode.value)}
                        className={`w-full text-left p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                          selectedMode === mode.value ? 'bg-purple-50 border border-purple-200' : ''
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <div>
                            <div className="font-medium text-gray-900">{mode.label}</div>
                            <div className="text-sm text-gray-500">{mode.description}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* Usage Stats */}
      {usageStats && (
        <div className="p-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <MessageSquare className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">
                {usageStats.messages_remaining} of {usageStats.daily_limit} messages left today
              </span>
            </div>
            {usageStats.messages_remaining <= 5 && (
              <button
                className="text-[#6d469b] hover:underline text-sm"
                onClick={() => window.open('/subscription', '_blank')}
              >
                Upgrade for more
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              Hi there! I'm OptioBot, your learning companion. What are you curious about today?
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-l-2xl rounded-tr-2xl'
                  : 'bg-gray-100 text-gray-800 rounded-r-2xl rounded-tl-2xl'
              } p-3 shadow-sm`}
            >
              <div className="flex items-start space-x-2">
                {message.role === 'assistant' && (
                  <Bot className="w-5 h-5 text-[#6d469b] flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.role === 'assistant' && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                      <div className="text-xs text-gray-500">
                        {new Date(message.created_at).toLocaleTimeString()}
                      </div>
                      <button
                        onClick={() => reportMessage(message.id)}
                        className="text-xs text-gray-400 hover:text-red-500 flex items-center space-x-1"
                        title="Report this message"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>Report</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-r-2xl rounded-tl-2xl p-3 shadow-sm max-w-[80%]">
              <div className="flex items-center space-x-2">
                <Bot className="w-5 h-5 text-[#6d469b]" />
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-[#6d469b] rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-[#6d469b] rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-[#6d469b] rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border-l-4 border-red-400 m-4 rounded">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-400 mr-2" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      )}


      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="flex space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about your learning..."
            disabled={isLoading || (usageStats && usageStats.messages_remaining <= 0)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            maxLength={2000}
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading || (usageStats && usageStats.messages_remaining <= 0)}
            className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white p-2 rounded-full hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        {usageStats && usageStats.messages_remaining <= 0 && (
          <p className="text-sm text-gray-500 mt-2 text-center">
            Daily message limit reached.
            <button
              onClick={() => window.open('/subscription', '_blank')}
              className="text-[#6d469b] hover:underline ml-1"
            >
              Upgrade for unlimited messages!
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default ChatInterface;