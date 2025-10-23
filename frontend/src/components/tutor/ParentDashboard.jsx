import React, { useState, useEffect } from 'react';
import {
  Shield,
  MessageSquare,
  Calendar,
  TrendingUp,
  AlertTriangle,
  Eye,
  Settings,
  Clock,
  BookOpen,
  BarChart3,
  Users
} from 'lucide-react';
import api from '../../services/api';

const ParentDashboard = ({ childUserId, childName }) => {
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [safetyReports, setSafetyReports] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadDashboardData();
  }, [childUserId]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadConversations(),
        loadAnalytics(),
        loadSafetyReports(),
        loadSettings()
      ]);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async () => {
    try {
      // This would require a parent-specific API endpoint
      const response = await api.get(`/tutor/parent/conversations/${childUserId}`);
      setConversations(response.data.conversations || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      // Fallback: load conversations as the child user (requires proper auth)
      try {
        const response = await api.get('/tutor/conversations', {
          headers: { 'X-Child-User-Id': childUserId }
        });
        setConversations(response.data.conversations || []);
      } catch (fallbackError) {
        console.error('Fallback failed:', fallbackError);
      }
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await api.get(`/tutor/parent/analytics/${childUserId}`);
      setAnalytics(response.data.analytics);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  const loadSafetyReports = async () => {
    try {
      const response = await api.get(`/tutor/parent/safety-reports/${childUserId}`);
      setSafetyReports(response.data.reports || []);
    } catch (error) {
      console.error('Failed to load safety reports:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await api.get(`/tutor/parent/settings/${childUserId}`);
      setSettings(response.data.settings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadConversationMessages = async (conversationId) => {
    try {
      const response = await api.get(`/tutor/parent/conversations/${conversationId}/messages`);
      setMessages(response.data.messages || []);
      setSelectedConversation(conversationId);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const updateNotificationSettings = async (newSettings) => {
    try {
      await api.put(`/tutor/parent/settings/${childUserId}`, newSettings);
      setSettings({ ...settings, ...newSettings });
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getSafetyLevelColor = (level) => {
    const colors = {
      safe: 'text-green-600 bg-green-100',
      warning: 'text-yellow-600 bg-yellow-100',
      blocked: 'text-red-600 bg-red-100',
      requires_review: 'text-purple-600 bg-purple-100'
    };
    return colors[level] || colors.safe;
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'conversations', label: 'Conversations', icon: MessageSquare },
    { id: 'safety', label: 'Safety', icon: Shield },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <Shield className="w-8 h-8 text-optio-purple" />
          <h1 className="text-3xl font-bold text-gray-900">Parent Dashboard</h1>
        </div>
        <p className="text-gray-600">Monitor {childName}'s AI tutor interactions and learning progress</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-optio-purple text-optio-purple'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Conversations</p>
                  <p className="text-2xl font-bold text-gray-900">{conversations.length}</p>
                </div>
                <MessageSquare className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Messages Today</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analytics?.messages_sent || 0}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Safety Flags</p>
                  <p className="text-2xl font-bold text-gray-900">{safetyReports.length}</p>
                </div>
                <AlertTriangle className={`w-8 h-8 ${safetyReports.length > 0 ? 'text-red-500' : 'text-gray-400'}`} />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Learning Topics</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {analytics?.topics_discussed?.length || 0}
                  </p>
                </div>
                <BookOpen className="w-8 h-8 text-purple-500" />
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Recent Activity</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {conversations.slice(0, 5).map((conversation) => (
                <div key={conversation.id} className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {conversation.title || 'Chat Session'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {conversation.message_count} messages • {formatDate(conversation.last_message_at)}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab('conversations');
                        loadConversationMessages(conversation.id);
                      }}
                      className="text-optio-purple hover:text-[#5a3d85] text-sm font-medium"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Learning Progress */}
          {analytics?.learning_pillars_covered && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Learning Areas Explored</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {analytics.learning_pillars_covered.map((pillar, index) => (
                  <div key={index} className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-gradient-primary-reverse rounded-full mx-auto mb-2"></div>
                    <p className="text-xs font-medium text-gray-700">{pillar}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conversations Tab */}
      {activeTab === 'conversations' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Conversation List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">All Conversations</h3>
              </div>
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => loadConversationMessages(conversation.id)}
                    className={`w-full text-left p-4 hover:bg-gray-50 ${
                      selectedConversation === conversation.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {conversation.title || 'Chat Session'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {conversation.message_count} messages
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(conversation.last_message_at)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="lg:col-span-2">
            {selectedConversation ? (
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">Conversation Messages</h3>
                </div>
                <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-lg ${
                          message.role === 'user'
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-xs font-medium">
                            {message.role === 'user' ? childName : 'OptioBot'}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full ${getSafetyLevelColor(message.safety_level)}`}>
                            {message.safety_level}
                          </span>
                        </div>
                        <p className="text-sm">{message.content}</p>
                        <p className="text-xs text-gray-500 mt-2">{formatDate(message.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
                <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Conversation</h3>
                <p className="text-gray-500">Choose a conversation from the list to view messages</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Safety Tab */}
      {activeTab === 'safety' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Safety Reports</h3>
              <p className="text-sm text-gray-500 mt-1">
                Automatic safety monitoring and flagged content
              </p>
            </div>
            <div className="divide-y divide-gray-200">
              {safetyReports.length > 0 ? (
                safetyReports.map((report) => (
                  <div key={report.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getSafetyLevelColor(report.safety_level)}`}>
                            {report.safety_level.replace('_', ' ').toUpperCase()}
                          </span>
                          <span className="text-sm text-gray-500">{report.incident_type}</span>
                        </div>
                        <p className="text-sm text-gray-900 mt-2">{report.original_message}</p>
                        {report.safety_reasons && report.safety_reasons.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500">Reasons:</p>
                            <ul className="text-xs text-gray-600 list-disc list-inside">
                              {report.safety_reasons.map((reason, index) => (
                                <li key={index}>{reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 mt-2">{formatDate(report.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center">
                  <Shield className="w-12 h-12 text-green-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">All Clear!</h3>
                  <p className="text-gray-500">No safety issues have been detected in the AI tutor conversations.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Monitoring Settings</h3>
              <p className="text-sm text-gray-500 mt-1">
                Configure how you want to monitor {childName}'s AI tutor interactions
              </p>
            </div>
            <div className="p-6 space-y-6">
              {/* Notification Frequency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notification Frequency
                </label>
                <select
                  value={settings?.notification_frequency || 'daily'}
                  onChange={(e) => updateNotificationSettings({ notification_frequency: e.target.value })}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#6d469b] focus:border-optio-purple"
                >
                  <option value="real_time">Real-time (immediate notifications)</option>
                  <option value="daily">Daily summary</option>
                  <option value="weekly">Weekly summary</option>
                  <option value="none">No notifications</option>
                </select>
              </div>

              {/* Access Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Access Level
                </label>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="access_level"
                      value="full"
                      checked={settings?.access_level === 'full'}
                      onChange={(e) => updateNotificationSettings({ access_level: e.target.value })}
                      className="text-optio-purple focus:ring-[#6d469b]"
                    />
                    <span className="ml-3 text-sm text-gray-700">
                      Full access (view all conversations and messages)
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="access_level"
                      value="summary"
                      checked={settings?.access_level === 'summary'}
                      onChange={(e) => updateNotificationSettings({ access_level: e.target.value })}
                      className="text-optio-purple focus:ring-[#6d469b]"
                    />
                    <span className="ml-3 text-sm text-gray-700">
                      Summary only (view topics and safety reports, not full messages)
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="access_level"
                      value="notification_only"
                      checked={settings?.access_level === 'notification_only'}
                      onChange={(e) => updateNotificationSettings({ access_level: e.target.value })}
                      className="text-optio-purple focus:ring-[#6d469b]"
                    />
                    <span className="ml-3 text-sm text-gray-700">
                      Notifications only (receive alerts for safety issues only)
                    </span>
                  </label>
                </div>
              </div>

              {/* Safety Alerts */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings?.safety_alerts_enabled !== false}
                    onChange={(e) => updateNotificationSettings({ safety_alerts_enabled: e.target.checked })}
                    className="text-optio-purple focus:ring-[#6d469b]"
                  />
                  <span className="ml-3 text-sm text-gray-700">
                    Enable immediate safety alerts
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Get notified immediately if any safety concerns are detected
                </p>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={() => updateNotificationSettings(settings)}
                  className="bg-gradient-primary-reverse text-white px-6 py-2 rounded-md hover:shadow-lg transition-shadow"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentDashboard;