import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActingAs } from '../contexts/ActingAsContext';
import { useParams, useNavigate } from 'react-router-dom';
import { parentAPI } from '../services/api';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import { getMyDependents } from '../services/dependentAPI';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
  UserGroupIcon,
  LightBulbIcon,
  XMarkIcon,
  ChevronRightIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import UnifiedEvidenceDisplay from '../components/evidence/UnifiedEvidenceDisplay';
import AddEvidenceModal from '../components/advisor/AddEvidenceModal';
import ProfileSwitcher from '../components/parent/ProfileSwitcher';
import AddDependentModal from '../components/parent/AddDependentModal';
import RequestStudentConnectionModal from '../components/parent/RequestStudentConnectionModal';

const ParentDashboardPage = () => {
  const { user } = useAuth();
  const { setActingAs, actingAsDependent } = useActingAs();
  const navigate = useNavigate();
  const { studentId } = useParams(); // Get student ID from URL if multi-child
  const [selectedStudentId, setSelectedStudentId] = useState(studentId || null);
  const [children, setChildren] = useState([]);
  const [dependents, setDependents] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [calendarData, setCalendarData] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [insightsData, setInsightsData] = useState(null);
  const [creditData, setCreditData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState(null);

  // If user is acting as dependent, redirect immediately to quest hub (without reload to prevent loop)
  useEffect(() => {
    if (actingAsDependent && window.location.pathname === '/parent/dashboard') {
      navigate('/quest-hub', { replace: true });
    }
  }, [actingAsDependent, navigate]);
  const [showRhythmModal, setShowRhythmModal] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskDetails, setTaskDetails] = useState(null);
  const [loadingTaskDetails, setLoadingTaskDetails] = useState(false);
  const [recentCompletions, setRecentCompletions] = useState([]);
  const [loadingCompletions, setLoadingCompletions] = useState(false);
  const [selectedCompletion, setSelectedCompletion] = useState(null);
  const [completedQuests, setCompletedQuests] = useState([]);
  const [showAddEvidenceModal, setShowAddEvidenceModal] = useState(false);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [showAddDependentModal, setShowAddDependentModal] = useState(false);
  const [showRequestConnectionModal, setShowRequestConnectionModal] = useState(false);
  const [showAddChildMenu, setShowAddChildMenu] = useState(false);

  // Pillar display names mapping
  const pillarDisplayNames = {
    art: 'Art',
    stem: 'STEM',
    wellness: 'Wellness',
    communication: 'Communication',
    civics: 'Civics'
  };

  // Initialize current profile (parent's own profile)
  useEffect(() => {
    if (user && !currentProfile) {
      setCurrentProfile({
        id: user.id,
        display_name: user.display_name || `${user.first_name} ${user.last_name}`,
        avatar_url: user.avatar_url,
        is_dependent: false
      });
    }
  }, [user, currentProfile]);

  // Load children list (admin-only linking, no invitations) and dependents
  useEffect(() => {
    const loadChildrenAndDependents = async () => {
      try {
        // Load both linked students and dependents in parallel
        const [childrenResponse, dependentsResponse] = await Promise.all([
          parentAPI.getMyChildren(),
          getMyDependents()
        ]);

        const childrenData = childrenResponse.data.children || [];
        const dependentsData = dependentsResponse.dependents || [];

        setChildren(childrenData);
        setDependents(dependentsData);

        // Auto-select first child or dependent if none selected
        if (!selectedStudentId) {
          if (childrenData.length > 0) {
            setSelectedStudentId(childrenData[0].student_id);
          } else if (dependentsData.length > 0) {
            setSelectedStudentId(dependentsData[0].id);
          }
        }

        // If no children AND no dependents, turn off loading so the empty state shows
        if (childrenData.length === 0 && dependentsData.length === 0) {
          setLoading(false);
        }
      } catch (error) {
        console.error('Error loading children/dependents:', error);
        setError('Failed to load students');
        setLoading(false); // Stop loading on error
      }
    };

    if (user?.role === 'parent' || user?.role === 'admin') {
      loadChildrenAndDependents();
    }
  }, [user]);


  // Load dashboard data when student selected and children/dependents are loaded
  useEffect(() => {
    const loadDashboardData = async () => {
      // Wait until we have student data before trying to load dashboard
      if (!selectedStudentId || (children.length === 0 && dependents.length === 0)) {
        if (children.length === 0 && dependents.length === 0) {
          setLoading(true); // Keep loading while children/dependents are being fetched
        } else {
          setLoading(false); // No student selected
        }
        return;
      }

      setLoading(true);
      try {
        // Load all data in parallel
        const [dashboard, calendar, progress, insights, credits, completed] = await Promise.all([
          parentAPI.getDashboard(selectedStudentId),
          parentAPI.getCalendar(selectedStudentId),
          parentAPI.getProgress(selectedStudentId),
          parentAPI.getInsights(selectedStudentId),
          api.get(`/api/credits/transcript/${selectedStudentId}`),
          parentAPI.getCompletedQuests(selectedStudentId)
        ]);

        setDashboardData(dashboard.data);
        setCalendarData(calendar.data);
        setProgressData(progress.data);
        setInsightsData(insights.data);
        setCreditData(credits.data.transcript);
        setCompletedQuests(completed.data.quests || []);
        setError(null);
      } catch (error) {
        console.error('Error loading dashboard:', error);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [selectedStudentId, children.length, dependents.length, user]);

  // Handle profile switching (parent <-> dependent)
  const handleProfileChange = (profile) => {
    if (profile.is_dependent) {
      // Switching to dependent: store in context and redirect to quest hub
      setActingAs(profile);
      // Don't use window.location.reload() - just navigate
      navigate('/quest-hub', { replace: true });
    } else {
      // Switching back to parent: clear acting-as state and stay on parent dashboard
      setActingAs(null);
      setCurrentProfile(profile);
      if (children.length > 0) {
        setSelectedStudentId(children[0].student_id);
      } else if (dependents.length > 0) {
        // If no linked children, just stay as parent viewing empty dashboard
        setSelectedStudentId(null);
      }
    }
  };

  // Handle adding a new dependent
  const handleAddDependent = () => {
    setShowAddDependentModal(true);
  };

  // Handle dependent creation success
  const handleDependentAdded = (result) => {
    toast.success(result.message || 'Dependent profile created');

    // Reload the page to refresh the children/dependents list
    // This ensures the ProfileSwitcher shows the new dependent
    window.location.reload();
  };

  // Load conversations when Communications tab is active
  useEffect(() => {
    const loadConversations = async () => {
      if (activeTab !== 'communications' || !selectedStudentId) {
        return;
      }

      setLoadingConversations(true);
      try {
        const response = await parentAPI.getTutorConversations(selectedStudentId);
        setConversations(response.data.conversations || []);
      } catch (error) {
        console.error('Error loading conversations:', error);
        toast.error('Failed to load tutor conversations');
      } finally {
        setLoadingConversations(false);
      }
    };

    loadConversations();
  }, [activeTab, selectedStudentId, user]);

  // Load conversation messages when a conversation is selected
  useEffect(() => {
    const loadMessages = async () => {
      if (!selectedConversationId) {
        setConversationMessages([]);
        return;
      }

      setLoadingMessages(true);
      try {
        const response = await parentAPI.getConversationMessages(selectedConversationId);
        setConversationMessages(response.data.messages || []);
      } catch (error) {
        console.error('Error loading conversation messages:', error);
        toast.error('Failed to load conversation messages');
      } finally {
        setLoadingMessages(false);
      }
    };

    loadMessages();
  }, [selectedConversationId, user]);

  // Load task details when a task is selected
  useEffect(() => {
    const loadTaskDetails = async () => {
      if (!selectedTask || !selectedStudentId) {
        setTaskDetails(null);
        return;
      }

      setLoadingTaskDetails(true);
      try {
        const response = await parentAPI.getTaskDetails(selectedStudentId, selectedTask.id);
        setTaskDetails(response.data);
      } catch (error) {
        console.error('Error loading task details:', error);
        toast.error('Failed to load task details');
      } finally {
        setLoadingTaskDetails(false);
      }
    };

    loadTaskDetails();
  }, [selectedTask, selectedStudentId, user]);

  // Load recent completions when Insights tab is active
  useEffect(() => {
    const loadCompletions = async () => {
      if (activeTab !== 'insights' || !selectedStudentId) {
        return;
      }

      setLoadingCompletions(true);
      try {
        const response = await parentAPI.getRecentCompletions(selectedStudentId);
        setRecentCompletions(response.data.completions || []);
      } catch (error) {
        console.error('Error loading completions:', error);
        toast.error('Failed to load recent completions');
      } finally {
        setLoadingCompletions(false);
      }
    };

    loadCompletions();
  }, [activeTab, selectedStudentId, user]);

  // Allow parent and admin roles to access the dashboard
  if (!user || (user.role !== 'parent' && user.role !== 'admin')) {
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

  if (children.length === 0 && dependents.length === 0 && !loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <UserGroupIcon className="w-20 h-20 text-purple-300 mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Welcome to Your Family Dashboard
            </h1>
            <p className="text-lg text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Get started by adding your child's profile
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-4">
            {/* Create Dependent Profile (Under 13) */}
            <button
              onClick={() => setShowAddDependentModal(true)}
              className="w-full bg-white border-2 border-optio-purple rounded-lg p-6 hover:shadow-lg transition-shadow text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg flex items-center justify-center">
                  <PlusIcon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-optio-purple transition-colors" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Create Child Profile (Under 13)
                  </h3>
                  <p className="text-gray-600 font-medium mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    For children under 13, you can create and fully manage their learning profile. Perfect for younger learners who need parental guidance.
                  </p>
                  <ul className="space-y-1 text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    <li>• Full access to manage their quests and tasks</li>
                    <li>• Upload evidence and track progress</li>
                    <li>• Mark tasks as complete on their behalf</li>
                    <li>• COPPA-compliant (no email required, optional at age 13)</li>
                  </ul>
                </div>
              </div>
            </button>

            {/* Connect to Existing Student (13+) */}
            <button
              onClick={() => setShowRequestConnectionModal(true)}
              className="w-full bg-white border-2 border-optio-pink rounded-lg p-6 hover:shadow-lg transition-shadow text-left group"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-optio-pink to-optio-purple rounded-lg flex items-center justify-center">
                  <UserGroupIcon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-optio-pink transition-colors" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Connect to Existing Student (13+)
                  </h3>
                  <p className="text-gray-600 font-medium mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    For teens with their own Optio account, email support@optioeducation.com to request a connection.
                  </p>
                  <ul className="space-y-1 text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    <li>• View their learning progress and achievements</li>
                    <li>• Upload evidence to help with quest tasks</li>
                    <li>• Student maintains control (marks tasks complete)</li>
                    <li>• Requires manual verification by Optio Support</li>
                  </ul>
                </div>
              </div>
            </button>
          </div>

          {/* Info Notice */}
          <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm text-purple-900 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              💡 <strong>Not sure which option?</strong> If your child is under 13, start with "Create Child Profile." For teens 13+, we recommend having them create their own account first, then use the "Connect to Existing Student" option.
            </p>
          </div>
        </div>

        {/* Modals for Empty State */}
        <AddDependentModal
          isOpen={showAddDependentModal}
          onClose={() => setShowAddDependentModal(false)}
          onSuccess={handleDependentAdded}
        />

        <RequestStudentConnectionModal
          isOpen={showRequestConnectionModal}
          onClose={() => setShowRequestConnectionModal(false)}
        />
      </div>
    );
  }

  const selectedStudent = children.find(c => c.student_id === selectedStudentId);
  const rhythmStatus = dashboardData?.learning_rhythm?.status || 'needs_support';
  const isFlowState = rhythmStatus === 'flow';

  // Show loading spinner while children/dependents list is loading
  if (loading && children.length === 0 && dependents.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Admin Demo Mode Notice */}
      {user.role === 'admin' && (
        <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <p className="text-blue-900 font-semibold text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Admin Demo Mode: You're viewing your own student data as a demo parent. This allows you to demonstrate parent dashboard features without switching accounts.
          </p>
        </div>
      )}

      {/* Header with Child Selector */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Family Dashboard
          </h1>
          {selectedStudent && (
            <p className="text-gray-600 mt-1 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Supporting {selectedStudent.student_first_name}'s learning journey
            </p>
          )}
        </div>

        {/* Multi-Child Selector + Profile Switcher + Learning Rhythm Indicator + Add Child Button */}
        <div className="flex gap-3 items-center flex-wrap">
          {/* Profile Switcher (Parent <-> Dependents) */}
          <ProfileSwitcher
            currentProfile={currentProfile}
            onProfileChange={handleProfileChange}
            onAddDependent={handleAddDependent}
          />

          {/* Add Child Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => setShowAddChildMenu(!showAddChildMenu)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:shadow-md transition-all font-semibold"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              <PlusIcon className="w-4 h-4" />
              <span className="text-sm">Add Child</span>
            </button>

            {showAddChildMenu && (
              <>
                {/* Backdrop to close menu */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowAddChildMenu(false)}
                />

                {/* Dropdown Menu */}
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-20 overflow-hidden">
                  <button
                    onClick={() => {
                      setShowAddChildMenu(false);
                      setShowAddDependentModal(true);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-purple-50 transition-colors border-b border-gray-200"
                  >
                    <div className="font-semibold text-gray-900 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Create Child Profile (Under 13)
                    </div>
                    <div className="text-xs text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Manage their account fully
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setShowAddChildMenu(false);
                      setShowRequestConnectionModal(true);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-pink-50 transition-colors"
                  >
                    <div className="font-semibold text-gray-900 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Connect Existing Student (13+)
                    </div>
                    <div className="text-xs text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Contact support to link their account
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Learning Rhythm Indicator - Clickable */}
          <button
            onClick={() => setShowRhythmModal(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all hover:shadow-md ${isFlowState ? 'bg-green-50 hover:bg-green-100' : 'bg-yellow-50 hover:bg-yellow-100'}`}
          >
            {isFlowState ? (
              <CheckCircleIcon className="w-5 h-5 text-green-600" />
            ) : (
              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />
            )}
            <span className={`text-sm font-semibold ${isFlowState ? 'text-green-800' : 'text-yellow-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
              {isFlowState ? 'In Flow' : 'Check-In Suggested'}
            </span>
          </button>

          {children.length > 1 && (
            <select
              value={selectedStudentId || ''}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg font-medium focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              style={{ fontFamily: 'Poppins, sans-serif' }}
            >
              {children.map((child) => (
                <option key={child.student_id} value={child.student_id}>
                  {child.student_first_name} {child.student_last_name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>


      {/* Learning Rhythm Modal */}
      {showRhythmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {isFlowState ? (
                  <CheckCircleIcon className="w-8 h-8 text-green-600" />
                ) : (
                  <ExclamationTriangleIcon className="w-8 h-8 text-yellow-600" />
                )}
                <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {isFlowState ? 'Learning Rhythm: In Flow' : 'Learning Rhythm: Check-In Suggested'}
                </h2>
              </div>
              <button
                onClick={() => setShowRhythmModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            {isFlowState ? (
              /* Flow State - Recent Completions */
              <div className="space-y-4">
                <p className="text-gray-700 font-medium mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {selectedStudent?.first_name} is making steady progress and staying engaged with their learning. Here's what they've been working on recently:
                </p>

                {dashboardData?.recent_completions && dashboardData.recent_completions.length > 0 ? (
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Recent Completions
                    </h3>
                    {dashboardData.recent_completions.slice(0, 10).map((completion, index) => (
                      <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {completion.task_title}
                            </h4>
                            <p className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {completion.quest_title} • {completion.pillar}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-semibold text-green-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              +{completion.xp_earned} XP
                            </span>
                            <p className="text-xs text-gray-500 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {new Date(completion.completed_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                    <p className="text-gray-700 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Keep celebrating their momentum! They're exploring and learning at their own pace.
                    </p>
                  </div>
                )}

                <div className="bg-white border-2 border-green-300 rounded-lg p-4 mt-6">
                  <h4 className="font-semibold text-green-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    💡 How to Support Flow State
                  </h4>
                  <ul className="space-y-2 text-sm font-medium text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    <li>• Celebrate what they're learning, not just what they're completing</li>
                    <li>• Ask them to teach you something new they discovered</li>
                    <li>• Notice their growth: "I see how much you've developed in [pillar area]"</li>
                    <li>• Keep the path clear - protect their learning time from interruptions</li>
                  </ul>
                </div>
              </div>
            ) : (
              /* Needs Support - Check-In Suggestions */
              <div className="space-y-4">
                <p className="text-gray-700 font-medium mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {dashboardData?.learning_rhythm?.has_overdue_tasks
                    ? `Some tasks are wandering past their deadlines. Here are some ways to help ${selectedStudent?.student_first_name} reconnect with their learning:`
                    : `${selectedStudent?.student_first_name} hasn't checked in recently. Here are some conversation starters:`}
                </p>

                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-6">
                  <h3 className="text-lg font-bold text-green-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Conversation Starters
                  </h3>
                  <ul className="space-y-2 text-gray-700 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    <li><strong>"I'd love to see what you're working on!"</strong></li>
                    <li><strong>"What's the most interesting thing you learned today?"</strong></li>
                    <li><strong>"Would you like help thinking through your schedule?"</strong></li>
                    <li><strong>"What feels most important to focus on right now?"</strong></li>
                  </ul>
                </div>

                <div className="bg-white border-2 border-purple-300 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Remember: The Process Is The Goal
                  </h4>
                  <p className="text-sm font-medium text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Learning isn't linear. Your role is to be a supportive presence, not a manager.
                  </p>
                </div>

                {dashboardData?.learning_rhythm?.has_overdue_tasks && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <h4 className="font-semibold text-orange-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Overdue Tasks: {dashboardData.learning_rhythm.overdue_task_count}
                    </h4>
                    {calendarData?.items && (
                      <ul className="space-y-2 mb-3">
                        {calendarData.items
                          .filter(item => item.status === 'wandering')
                          .slice(0, 5)
                          .map((item) => (
                            <li key={item.id} className="text-sm font-medium text-gray-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              <span className="font-semibold">{item.task_title}</span>
                              <span className="text-gray-600"> • {item.quest_title}</span>
                            </li>
                          ))}
                      </ul>
                    )}
                    <p className="text-sm font-medium text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Deadlines are tools, not rules. Help them understand what got in the way.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowRhythmModal(false)}
                className="px-6 py-2 bg-gradient-primary text-white rounded-lg font-semibold hover:shadow-lg transition-shadow"
                style={{ fontFamily: 'Poppins, sans-serif' }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
        </div>
      ) : (
        <>
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
                      ? 'border-b-2 border-optio-purple text-optio-purple'
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
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Active Quests
                  </h3>
                  <button
                    onClick={() => setShowAddEvidenceModal(true)}
                    className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity flex items-center space-x-2"
                    style={{ fontFamily: 'Poppins, sans-serif' }}
                  >
                    <PlusIcon className="w-5 h-5" />
                    <span>Add Evidence</span>
                  </button>
                </div>
                {dashboardData?.active_quests?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dashboardData.active_quests.map((quest) => (
                      <button
                        key={quest.quest_id}
                        onClick={() => navigate(`/parent/quest/${selectedStudentId}/${quest.quest_id}`)}
                        className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer text-left"
                      >
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
                            <span className="text-optio-purple font-semibold" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {quest.progress.percentage}%
                            </span>
                          </div>
                          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-gradient-primary h-2 rounded-full transition-all"
                              style={{ width: `${quest.progress.percentage}%` }}
                            />
                          </div>
                        </div>
                      </button>
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
                    {Object.entries(progressData.xp_by_pillar)
                      .filter(([pillar]) => {
                        // Backend returns display names like "Art", "STEM", etc.
                        // Only show the new pillar names (not old legacy names)
                        const validPillarNames = Object.values(pillarDisplayNames);
                        return validPillarNames.includes(pillar);
                      })
                      .map(([pillar, xp]) => (
                        <div key={pillar} className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-900 text-sm mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {pillar}
                          </h4>
                          <p className="text-2xl font-bold text-optio-purple" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {xp} XP
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Completed Quests */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Completed Quests
                </h3>
                {completedQuests.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {completedQuests.map((quest) => (
                      <button
                        key={quest.quest_id}
                        onClick={() => navigate(`/parent/quest/${selectedStudentId}/${quest.quest_id}`)}
                        className="border border-green-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer text-left bg-green-50"
                      >
                        {quest.image_url && (
                          <img src={quest.image_url} alt={quest.title} className="w-full h-32 object-cover" />
                        )}
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {quest.title}
                            </h4>
                            <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0" />
                          </div>
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {quest.progress.completed_tasks} / {quest.progress.total_tasks} tasks
                            </span>
                            <span className="text-green-600 font-semibold" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              Completed
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {new Date(quest.completed_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    No completed quests yet. They're just getting started on their learning journey!
                  </p>
                )}
              </div>

              {/* Diploma Credit Progress */}
              {creditData?.subjects && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Diploma Progress
                  </h3>
                  <p className="text-gray-600 font-medium mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {creditData.total_credits} / 20 credits earned toward diploma
                  </p>
                  <div className="space-y-4">
                    {creditData.subjects.map((subject) => {
                      const creditsEarned = Math.floor(subject.xp / 1000);
                      const progressPercent = (creditsEarned / 4) * 100;
                      return (
                        <div key={subject.subject}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {subject.subject}
                            </span>
                            <span className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {creditsEarned} / 4 credits
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className="bg-gradient-primary h-3 rounded-full transition-all"
                              style={{ width: `${Math.min(progressPercent, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
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
                      <div
                        key={item.id}
                        className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:shadow-md hover:border-purple-300 transition-all cursor-pointer"
                        onClick={() => setSelectedTask(item)}
                      >
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
                        <ChevronRightIcon className="h-5 w-5 text-gray-400 flex-shrink-0 mt-1" />
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

          {/* Task Detail Modal */}
          {selectedTask && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg max-w-3xl w-full max-h-[85vh] overflow-hidden">
                <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Task Details
                  </h3>
                  <button
                    onClick={() => setSelectedTask(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
                  {loadingTaskDetails ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                    </div>
                  ) : taskDetails ? (
                    <div className="space-y-6">
                      {/* Quest Info */}
                      {taskDetails.quest && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                          <h4 className="font-bold text-purple-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            From Quest: {taskDetails.quest.title}
                          </h4>
                          {taskDetails.quest.description && (
                            <p className="text-sm text-purple-800 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {taskDetails.quest.description}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Task Info */}
                      <div>
                        <h4 className="text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {taskDetails.task.title}
                        </h4>
                        {taskDetails.task.description && (
                          <p className="text-gray-700 font-medium mb-3 whitespace-pre-wrap" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {taskDetails.task.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {taskDetails.task.pillar}
                          </span>
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {taskDetails.task.xp_value} XP
                          </span>
                          {taskDetails.task.is_required && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              Required
                            </span>
                          )}
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                            taskDetails.task.status === 'completed' ? 'bg-green-100 text-green-800' :
                            taskDetails.task.status === 'overdue' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {taskDetails.task.status === 'completed' ? 'Completed' :
                             taskDetails.task.status === 'overdue' ? 'Overdue' :
                             taskDetails.task.status === 'scheduled' ? 'Scheduled' :
                             'Not Started'}
                          </span>
                        </div>
                        {taskDetails.task.scheduled_date && (
                          <p className="text-sm text-gray-600 font-medium mt-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            Scheduled: {new Date(taskDetails.task.scheduled_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      {/* Task Status Note */}
                      <div className="border-t border-gray-200 pt-6">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm text-blue-900 font-semibold mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            This is a scheduled task for your learner
                          </p>
                          <p className="text-xs text-blue-800 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            View completed tasks and evidence in the Insights tab under "Recently Completed"
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Failed to load task details
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'insights' && insightsData && (
            <div className="space-y-6">

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
                              className="bg-gradient-primary h-2 rounded-full"
                              style={{ width: `${(item.completions / insightsData.pillar_preferences[0].completions) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}


              {/* Recently Completed */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Recently Completed (Last 30 Days)
                </h3>
                {loadingCompletions ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                    <span className="ml-3 text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Loading completions...
                    </span>
                  </div>
                ) : recentCompletions.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircleIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      No tasks completed in the last 30 days
                    </p>
                    <p className="text-gray-400 text-sm mt-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Completed tasks will appear here with submitted evidence
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentCompletions.map((completion) => (
                      <div
                        key={completion.completion_id}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-purple-300 transition-all cursor-pointer"
                        onClick={() => setSelectedCompletion(completion)}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0">
                            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                              <CheckCircleIcon className="w-6 h-6 text-green-600" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {completion.task.title}
                            </h4>
                            <p className="text-sm text-gray-600 font-medium mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              {completion.quest.title} • {completion.task.pillar}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold px-2 py-1 rounded bg-green-100 text-green-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                {new Date(completion.completed_at).toLocaleDateString()}
                              </span>
                              <span className="text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                {completion.task.xp_value} XP
                              </span>
                              {(completion.evidence_text || completion.evidence_url || (completion.evidence_blocks && completion.evidence_blocks.length > 0)) && (
                                <span className="text-xs font-semibold px-2 py-1 rounded bg-purple-100 text-purple-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                  Has Evidence
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRightIcon className="h-5 w-5 text-gray-400 flex-shrink-0 mt-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200 mb-6">
                <p className="text-purple-900 font-medium text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  🔒 Privacy respected: Conversations are available for safety monitoring while honoring your learner's autonomy.
                </p>
              </div>

              {loadingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                  <span className="ml-3 text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Loading conversations...
                  </span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8">
                  <ChatBubbleLeftRightIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    No tutor conversations yet
                  </p>
                  <p className="text-gray-400 text-sm mt-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Conversations will appear here when your learner uses OptioBot
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => setSelectedConversationId(conv.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {conv.title}
                          </h4>
                          <p className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            Mode: <span className="capitalize">{conv.mode}</span> • {conv.message_count} messages
                          </p>
                          <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            Last activity: {new Date(conv.last_activity).toLocaleDateString()}
                          </p>
                        </div>
                        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Conversation Detail Modal */}
              {selectedConversationId && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden">
                    <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        Conversation Details
                      </h3>
                      <button
                        onClick={() => setSelectedConversationId(null)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <XMarkIcon className="h-6 w-6" />
                      </button>
                    </div>
                    <div className="p-6 overflow-y-auto max-h-[60vh]">
                      {loadingMessages ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                        </div>
                      ) : conversationMessages.length === 0 ? (
                        <p className="text-gray-500 text-center py-8" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          No messages in this conversation
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {conversationMessages.map((msg) => (
                            <div
                              key={msg.id}
                              className={`p-4 rounded-lg ${
                                msg.role === 'user'
                                  ? 'bg-purple-50 border border-purple-200 ml-8'
                                  : 'bg-gray-50 border border-gray-200 mr-8'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span
                                  className={`text-xs font-semibold ${
                                    msg.role === 'user' ? 'text-purple-700' : 'text-gray-700'
                                  }`}
                                  style={{ fontFamily: 'Poppins, sans-serif' }}
                                >
                                  {msg.role === 'user' ? 'Student' : 'OptioBot'}
                                </span>
                                {msg.safety_level !== 'safe' && (
                                  <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-1 rounded">
                                    ⚠️ {msg.safety_level}
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-800 font-medium whitespace-pre-wrap" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                {msg.content}
                              </p>
                              <p className="text-xs text-gray-500 mt-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                {new Date(msg.created_at).toLocaleString()}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Completion Evidence Modal */}
          {selectedCompletion && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg max-w-3xl w-full max-h-[85vh] overflow-hidden">
                <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Completed Task Evidence
                  </h3>
                  <button
                    onClick={() => setSelectedCompletion(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[calc(85vh-80px)]">
                  <div className="space-y-6">
                    {/* Quest Context */}
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <h4 className="font-bold text-purple-900 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        From Quest: {selectedCompletion.quest.title}
                      </h4>
                      <p className="text-sm text-purple-800 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        Task: {selectedCompletion.task.title}
                      </p>
                    </div>

                    {/* Task Info */}
                    {selectedCompletion.task.description && (
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          Task Description:
                        </h4>
                        <p className="text-gray-700 font-medium whitespace-pre-wrap" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {selectedCompletion.task.description}
                        </p>
                      </div>
                    )}

                    {/* Completion Info */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-sm text-green-800 font-semibold mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        Completed on {new Date(selectedCompletion.completed_at).toLocaleDateString()}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {selectedCompletion.task.xp_value} XP
                        </span>
                        <span className="text-xs font-semibold px-2 py-1 rounded bg-purple-100 text-purple-800" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {selectedCompletion.task.pillar}
                        </span>
                      </div>
                    </div>

                    {/* Evidence */}
                    <div className="border-t border-gray-200 pt-6">
                      <h4 className="text-lg font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        Submitted Evidence
                      </h4>

                      <UnifiedEvidenceDisplay
                        evidence={{
                          evidence_type: selectedCompletion.evidence_type,
                          evidence_blocks: selectedCompletion.evidence_blocks,
                          evidence_text: selectedCompletion.evidence_text,
                          evidence_url: selectedCompletion.evidence_url
                        }}
                        displayMode="full"
                        showMetadata={false}
                        allowPrivateBlocks={true}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </>
      )}

      {/* Add Evidence Modal */}
      {showAddEvidenceModal && selectedStudentId && (
        <AddEvidenceModal
          isOpen={showAddEvidenceModal}
          onClose={() => setShowAddEvidenceModal(false)}
          studentId={selectedStudentId}
          studentName={children.find(c => c.student_id === selectedStudentId)?.student_name || 'Student'}
        />
      )}

      {/* Add Dependent Modal */}
      <AddDependentModal
        isOpen={showAddDependentModal}
        onClose={() => setShowAddDependentModal(false)}
        onSuccess={handleDependentAdded}
      />

      {/* Request Student Connection Modal */}
      <RequestStudentConnectionModal
        isOpen={showRequestConnectionModal}
        onClose={() => setShowRequestConnectionModal(false)}
      />
    </div>
  );
};

export default ParentDashboardPage;
