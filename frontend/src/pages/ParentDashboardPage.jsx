import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useParams } from 'react-router-dom';
import { parentAPI } from '../services/api';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
  UserGroupIcon,
  LightBulbIcon,
  PaperAirplaneIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const ParentDashboardPage = () => {
  const { user } = useAuth();
  const { studentId } = useParams(); // Get student ID from URL if multi-child
  const [selectedStudentId, setSelectedStudentId] = useState(studentId || null);
  const [children, setChildren] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [calendarData, setCalendarData] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [insightsData, setInsightsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState(null);
  const [studentEmail, setStudentEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);

  // Load children list and pending requests
  useEffect(() => {
    const loadChildren = async () => {
      try {
        const [childrenResponse, requestsResponse] = await Promise.all([
          parentAPI.getMyChildren(),
          api.get('/api/parents/pending-requests')
        ]);

        setChildren(childrenResponse.data.children || []);
        setPendingRequests(requestsResponse.data.pending_requests || []);

        // Auto-select first child if none selected
        if (!selectedStudentId && childrenResponse.data.children?.length > 0) {
          setSelectedStudentId(childrenResponse.data.children[0].student_id);
        }
      } catch (error) {
        console.error('Error loading children:', error);
        setError('Failed to load linked students');
      }
    };

    if (user?.role === 'parent') {
      loadChildren();
    }
  }, [user]);

  const sendLinkRequest = async (e) => {
    e.preventDefault();
    if (!studentEmail.trim()) {
      toast.error('Please enter a student email address');
      return;
    }

    setSending(true);
    try {
      const response = await api.post('/api/parents/request-link', { student_email: studentEmail });
      toast.success(response.data.message);
      setStudentEmail('');
      // Reload to show new pending request
      const requestsResponse = await api.get('/api/parents/pending-requests');
      setPendingRequests(requestsResponse.data.pending_requests || []);
    } catch (error) {
      console.error('Error sending link request:', error);
      const message = error.response?.data?.error || 'Failed to send link request';
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  // Load dashboard data when student selected
  useEffect(() => {
    const loadDashboardData = async () => {
      if (!selectedStudentId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Load all data in parallel
        const [dashboard, calendar, progress, insights] = await Promise.all([
          parentAPI.getDashboard(selectedStudentId),
          parentAPI.getCalendar(selectedStudentId),
          parentAPI.getProgress(selectedStudentId),
          parentAPI.getInsights(selectedStudentId)
        ]);

        setDashboardData(dashboard.data);
        setCalendarData(calendar.data);
        setProgressData(progress.data);
        setInsightsData(insights.data);
        setError(null);
      } catch (error) {
        console.error('Error loading dashboard:', error);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [selectedStudentId]);

  if (!user || user.role !== 'parent') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <ExclamationTriangleIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Parent Access Only
        </h2>
        <p className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
          This dashboard is only available to parent accounts.
        </p>
      </div>
    );
  }

  if (children.length === 0 && !loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <UserGroupIcon className="w-20 h-20 text-purple-300 mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Welcome to Your Family Dashboard
            </h1>
            <p className="text-lg text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Connect with your student to view their learning progress
            </p>
          </div>

          {/* Send Connection Request Form */}
          <div className="bg-white rounded-xl shadow-sm border-2 border-purple-200 p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Send Connection Request
            </h3>
            <p className="text-gray-600 font-medium mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Enter your student's email address to send them a connection request. They'll see it in their Connections page and can approve it.
            </p>
            <form onSubmit={sendLinkRequest} className="flex gap-3">
              <input
                type="email"
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
                placeholder="student@example.com"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent font-medium"
                style={{ fontFamily: 'Poppins, sans-serif' }}
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending}
                className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg font-semibold hover:shadow-lg transition-shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                style={{ fontFamily: 'Poppins, sans-serif' }}
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="w-5 h-5" />
                    Send Request
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Pending Requests */}
          {pendingRequests.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Pending Requests ({pendingRequests.length})
              </h3>
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <div key={request.link_id} className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden">
                        {request.student_avatar_url ? (
                          <img src={request.student_avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <UserGroupIcon className="w-6 h-6 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {request.student_first_name} {request.student_last_name}
                        </p>
                        <p className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {request.student_email} • Sent {new Date(request.requested_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Awaiting Approval
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alternative Method */}
          <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Or, have your student send you a request:
            </h3>
            <ol className="space-y-3 text-gray-700 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">1</span>
                <span>Your student logs in to their Optio account</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">2</span>
                <span>They go to their <strong>Profile</strong> page</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">3</span>
                <span>You'll see their request here to approve</span>
              </li>
            </ol>
          </div>

          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-900 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              💡 <strong>Note:</strong> Once your student approves the connection, you'll have permanent read-only access to support their learning journey.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const selectedStudent = children.find(c => c.student_id === selectedStudentId);
  const rhythmStatus = dashboardData?.learning_rhythm?.status || 'needs_support';
  const isFlowState = rhythmStatus === 'flow';

  // Show loading spinner while children list is loading
  if (loading && children.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with Child Selector */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Family Dashboard
          </h1>
          {selectedStudent && (
            <p className="text-gray-600 mt-1 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Supporting {selectedStudent.first_name}'s learning journey
            </p>
          )}
        </div>

        {/* Multi-Child Selector */}
        {children.length > 1 && (
          <select
            value={selectedStudentId || ''}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg font-medium focus:ring-2 focus:ring-purple-600 focus:border-transparent"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            {children.map((child) => (
              <option key={child.student_id} value={child.student_id}>
                {child.first_name} {child.last_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        </div>
      ) : (
        <>
          {/* Learning Rhythm Indicator */}
          <div className={`mb-8 rounded-lg p-6 ${isFlowState ? 'bg-green-50 border-2 border-green-500' : 'bg-yellow-50 border-2 border-yellow-500'}`}>
            <div className="flex items-start gap-4">
              {isFlowState ? (
                <CheckCircleIcon className="w-12 h-12 text-green-600 flex-shrink-0" />
              ) : (
                <ExclamationTriangleIcon className="w-12 h-12 text-yellow-600 flex-shrink-0" />
              )}
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Poppins, sans-serif', color: isFlowState ? '#3DA24A' : '#FF9028' }}>
                  {isFlowState ? 'Your learner is in their flow state' : 'Your learner might benefit from a check-in'}
                </h2>
                <p className="text-gray-700 font-medium mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {isFlowState
                    ? 'They\'re making steady progress and staying engaged with their learning.'
                    : dashboardData?.learning_rhythm?.has_overdue_tasks
                      ? 'Some tasks are wandering past their deadlines. A gentle reminder might help.'
                      : 'They haven\'t checked in recently. Maybe it\'s time to explore a quest together?'}
                </p>

                {/* Weekly Wins or Support Suggestions */}
                {isFlowState && dashboardData?.weekly_wins?.length > 0 ? (
                  <div className="bg-white rounded-lg p-4 border border-green-200">
                    <h3 className="font-semibold text-green-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Weekly Wins
                    </h3>
                    <ul className="space-y-2">
                      {dashboardData.weekly_wins.slice(0, 5).map((win, index) => (
                        <li key={index} className="text-gray-700 text-sm font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          • {win.type === 'quest_completed' ? '🎉 Completed: ' : '🏆 Earned: '}{win.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : !isFlowState && (
                  <div className="bg-white rounded-lg p-4 border border-yellow-200">
                    <h3 className="font-semibold text-yellow-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Conversation Starters
                    </h3>
                    <ul className="space-y-2 text-sm font-medium text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      <li>• "I'd love to see what you're working on!"</li>
                      <li>• "What's the most interesting thing you learned today?"</li>
                      <li>• "Would you like help thinking through your schedule?"</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="flex gap-8">
              {[
                { id: 'overview', label: 'Overview', icon: ChartBarIcon },
                { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
                { id: 'insights', label: 'Insights', icon: LightBulbIcon },
                { id: 'communications', label: 'Communications', icon: ChatBubbleLeftRightIcon }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-4 px-2 font-semibold transition-colors flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-b-2 border-purple-600 text-purple-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                >
                  <tab.icon className="w-5 h-5" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Active Quests */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Active Quests
                </h3>
                {dashboardData?.active_quests?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dashboardData.active_quests.map((quest) => (
                      <div key={quest.quest_id} className="border border-gray-200 rounded-lg overflow-hidden">
                        {quest.image_url && (
                          <img src={quest.image_url} alt={quest.title} className="w-full h-32 object-cover" />
                        )}
                        <div className="p-4">
                          <h4 className="font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {quest.title}
                          </h4>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {quest.progress.completed_tasks} / {quest.progress.total_tasks} tasks
                            </span>
                            <span className="text-purple-600 font-semibold" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {quest.progress.percentage}%
                            </span>
                          </div>
                          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-purple-600 to-pink-500 h-2 rounded-full transition-all"
                              style={{ width: `${quest.progress.percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    No active quests right now. They might be exploring what to start next!
                  </p>
                )}
              </div>

              {/* XP by Pillar */}
              {progressData?.xp_by_pillar && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Learning Progress
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(progressData.xp_by_pillar).map(([pillar, xp]) => (
                      <div key={pillar} className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 text-sm mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {pillar}
                        </h4>
                        <p className="text-2xl font-bold text-purple-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {xp} XP
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Scheduled Tasks
              </h3>
              {calendarData?.items?.length > 0 ? (
                <div className="space-y-3">
                  {calendarData.items
                    .filter(item => item.status !== 'completed')
                    .sort((a, b) => {
                      if (!a.scheduled_date) return 1;
                      if (!b.scheduled_date) return -1;
                      return new Date(a.scheduled_date) - new Date(b.scheduled_date);
                    })
                    .slice(0, 10)
                    .map((item) => (
                      <div key={item.id} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg">
                        <CalendarIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {item.task_title}
                          </h4>
                          <p className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {item.quest_title} • {item.pillar}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {item.scheduled_date && (
                              <span className={`text-xs font-semibold px-2 py-1 rounded ${
                                item.status === 'wandering' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                              }`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                                {item.status === 'wandering' ? 'Overdue' : new Date(item.scheduled_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-gray-500 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  No scheduled tasks yet. They're exploring freely!
                </p>
              )}
            </div>
          )}

          {activeTab === 'insights' && insightsData && (
            <div className="space-y-6">
              {/* Time Patterns */}
              {insightsData.time_patterns && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Learning Patterns
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {insightsData.time_patterns.peak_hour && (
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          Peak Learning Time
                        </h4>
                        <p className="text-2xl font-bold text-purple-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {insightsData.time_patterns.peak_hour}
                        </p>
                        <p className="text-sm text-gray-600 font-medium mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          Most active during this hour
                        </p>
                      </div>
                    )}
                    {insightsData.time_patterns.peak_day && (
                      <div>
                        <h4 className="font-semibold text-gray-700 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          Most Active Day
                        </h4>
                        <p className="text-2xl font-bold text-purple-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {insightsData.time_patterns.peak_day}
                        </p>
                        <p className="text-sm text-gray-600 font-medium mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          They seem to flow best on this day
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pillar Preferences */}
              {insightsData.pillar_preferences?.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Learning Areas
                  </h3>
                  <div className="space-y-3">
                    {insightsData.pillar_preferences.map((item, index) => (
                      <div key={index} className="flex items-center gap-4">
                        <span className="text-2xl font-bold text-gray-400" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {item.pillar}
                            </span>
                            <span className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {item.completions} completions
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-purple-600 to-pink-500 h-2 rounded-full"
                              style={{ width: `${(item.completions / insightsData.pillar_preferences[0].completions) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completion Velocity */}
              {insightsData.completion_velocity?.average_days_per_quest && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Learning Pace
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="bg-purple-50 rounded-full p-4">
                      <ArrowPathIcon className="w-8 h-8 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        {insightsData.completion_velocity.average_days_per_quest} days
                      </p>
                      <p className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        Average time per quest
                      </p>
                      <p className="text-sm text-gray-500 font-medium mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        Based on {insightsData.completion_velocity.total_quests_analyzed} completed quests
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'communications' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                AI Tutor Conversations
              </h3>
              <p className="text-gray-600 font-medium mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                View your learner's conversations with OptioBot. All conversations are automatically monitored for safety.
              </p>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <p className="text-purple-900 font-medium text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  🔒 Privacy respected: Conversations are available for safety monitoring while honoring your learner's autonomy.
                </p>
              </div>
              {/* TODO: Implement conversation list */}
              <p className="text-gray-500 font-medium mt-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Communication monitoring feature coming soon.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ParentDashboardPage;
