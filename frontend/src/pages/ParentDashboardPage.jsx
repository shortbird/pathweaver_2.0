import { useState, useEffect } from 'react';
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
  UserIcon,
  XMarkIcon,
  PlusIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import AddDependentModal from '../components/parent/AddDependentModal';
import RequestStudentConnectionModal from '../components/parent/RequestStudentConnectionModal';

const ParentDashboardPage = () => {
  const { user } = useAuth();
  const { setActingAs, actingAsDependent, clearActingAs } = useActingAs();
  const navigate = useNavigate();
  const { studentId } = useParams(); // Get student ID from URL if multi-child
  const [selectedStudentId, setSelectedStudentId] = useState(studentId || null);
  const [children, setChildren] = useState([]);
  const [dependents, setDependents] = useState([]);
  const [dashboardDataCache, setDashboardDataCache] = useState({}); // Cache by student ID
  const [dashboardData, setDashboardData] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [creditData, setCreditData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRhythmModal, setShowRhythmModal] = useState(false);
  const [completedQuests, setCompletedQuests] = useState([]);
  const [showAddDependentModal, setShowAddDependentModal] = useState(false);
  const [showRequestConnectionModal, setShowRequestConnectionModal] = useState(false);

  // Pillar display names mapping
  const pillarDisplayNames = {
    art: 'Art',
    stem: 'STEM',
    wellness: 'Wellness',
    communication: 'Communication',
    civics: 'Civics'
  };

  // Early return: Show message if trying to access parent dashboard while acting as dependent
  if (actingAsDependent) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <UserGroupIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Acting as {actingAsDependent.display_name}
        </h1>
        <p className="text-gray-600 font-medium mb-6" style={{ fontFamily: 'Poppins, sans-serif' }}>
          You're currently managing your child's profile. To view the parent dashboard, switch back to your profile using the banner in the bottom-left corner.
        </p>
        <button
          onClick={() => {
            clearActingAs();
          }}
          className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-lg transition-shadow"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          Switch Back to Parent View
        </button>
      </div>
    );
  }

  // Load children list (admin-only linking, no invitations) and dependents
  useEffect(() => {
    // Skip loading if acting as dependent (will be redirected to student dashboard)
    if (actingAsDependent) {
      return;
    }

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
  }, [user]); // Removed actingAsDependent from dependencies - early return handles it


  // Load dashboard data when student selected and children/dependents are loaded
  useEffect(() => {
    // Skip loading if acting as dependent (will be redirected to student dashboard)
    if (actingAsDependent) {
      return;
    }

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

      // Check cache first for instant switching
      if (dashboardDataCache[selectedStudentId]) {
        const cached = dashboardDataCache[selectedStudentId];
        setDashboardData(cached.dashboard);
        setProgressData(cached.progress);
        setCreditData(cached.credits);
        setCompletedQuests(cached.completed);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Load only overview data
        const [dashboard, progress, credits, completed] = await Promise.all([
          parentAPI.getDashboard(selectedStudentId),
          parentAPI.getProgress(selectedStudentId),
          api.get(`/api/credits/transcript/${selectedStudentId}`),
          parentAPI.getCompletedQuests(selectedStudentId)
        ]);

        const data = {
          dashboard: dashboard.data,
          progress: progress.data,
          credits: credits.data.transcript,
          completed: completed.data.quests || []
        };

        // Store in cache
        setDashboardDataCache(prev => ({
          ...prev,
          [selectedStudentId]: data
        }));

        setDashboardData(data.dashboard);
        setProgressData(data.progress);
        setCreditData(data.credits);
        setCompletedQuests(data.completed);
        setError(null);
      } catch (error) {
        console.error('Error loading dashboard:', error);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [selectedStudentId, children.length, dependents.length, user]); // Removed actingAsDependent - early return handles it

  // Helper to calculate age from date_of_birth
  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Handler for "Act As Dependent" button
  const handleActAsDependent = async (dependent) => {
    try {
      await setActingAs(dependent);
      toast.success(`Now managing ${dependent.display_name}'s account`);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Failed to switch to dependent profile:', error);
      toast.error('Failed to switch profiles. Please try again.');
    }
  };

  // Handle dependent creation success
  const handleDependentAdded = (result) => {
    toast.success(result.message || 'Dependent profile created');

    // Reload the page to refresh the children/dependents list
    // This ensures the ProfileSwitcher shows the new dependent
    window.location.reload();
  };


  // Check if logged-in user is a dependent - redirect to student dashboard
  if (user && user.is_dependent) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  // Allow parent and admin roles to access the dashboard
  if (!user || (user.role !== 'parent' && user.role !== 'admin')) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <ExclamationTriangleIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Parent Access Only
        </h1>
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
                  <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-optio-purple transition-colors" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Create Child Profile (Under 13)
                  </h2>
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
                  <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-optio-pink transition-colors" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    Connect to Existing Student (13+)
                  </h2>
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

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
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

        {/* Add Child Button */}
        <div className="relative">
          <button
            onClick={() => setShowAddDependentModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-lg transition-shadow"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <PlusIcon className="w-5 h-5" />
            Add Child
          </button>
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
          {/* Student Tabs */}
          {(children.length > 1 || dependents.length > 1 || (children.length > 0 && dependents.length > 0)) && (
            <div className="border-b border-gray-200 mb-6">
              <nav className="flex gap-6 overflow-x-auto pb-4">
                {/* Linked 13+ students */}
                {children.map((child) => {
                  // Calculate age if date_of_birth is available
                  const age = child.date_of_birth ? calculateAge(child.date_of_birth) : null;
                  const showAgeIcon = age !== null && age < 13;

                  return (
                    <button
                      key={child.student_id}
                      onClick={() => setSelectedStudentId(child.student_id)}
                      className={`pb-4 px-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                        selectedStudentId === child.student_id
                          ? 'border-b-2 border-optio-purple text-optio-purple'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      style={{ fontFamily: 'Poppins, sans-serif' }}
                    >
                      <UserIcon className="w-5 h-5" />
                      {child.student_first_name} {child.student_last_name}
                      {showAgeIcon && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Under 13</span>
                      )}
                    </button>
                  );
                })}

                {/* Dependents (under 13) */}
                {dependents.map((dependent) => {
                  const isSelected = selectedStudentId === dependent.id;

                  return (
                    <button
                      key={dependent.id}
                      onClick={() => setSelectedStudentId(dependent.id)}
                      className={`pb-4 px-2 font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                        isSelected
                          ? 'border-b-2 border-optio-purple text-optio-purple'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      style={{ fontFamily: 'Poppins, sans-serif' }}
                    >
                      <UserIcon className="w-5 h-5" />
                      {dependent.display_name}
                    </button>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Act As Banner for Under-13 Dependents */}
          {(() => {
            const selectedDependent = dependents.find(d => d.id === selectedStudentId);
            if (!selectedDependent) return null;

            const age = selectedDependent.age || calculateAge(selectedDependent.date_of_birth);
            const isUnder13 = age !== null && age < 13;
            const firstName = selectedDependent.display_name?.split(' ')[0] || selectedDependent.display_name;

            if (!isUnder13) return null;

            return (
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-l-4 border-optio-purple px-4 sm:px-6 py-3 mb-6 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm sm:text-base" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      Managing {firstName}'s Profile (Under 13)
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 mt-0.5" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      You're viewing as a parent. Click "Act as {firstName}" to use the full platform as your student.
                    </p>
                  </div>
                  <button
                    onClick={() => handleActAsDependent(selectedDependent)}
                    className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg text-sm font-semibold hover:opacity-90 shadow-sm whitespace-nowrap self-start sm:self-center"
                    style={{ fontFamily: 'Poppins, sans-serif' }}
                  >
                    Act As {firstName}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Overview Content */}
          <div className="space-y-6">
              {/* Active Quests */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Active Quests
                </h3>
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
                          <div className="mt-3 text-xs text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            Click to view tasks and add evidence
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  (() => {
                    // Determine if this is a dependent (under 13) or linked student (13+)
                    const selectedDependent = dependents.find(d => d.id === selectedStudentId);
                    const isDependent = !!selectedDependent;
                    const age = selectedDependent
                      ? (selectedDependent.age || calculateAge(selectedDependent.date_of_birth))
                      : null;
                    const isUnder13 = age !== null && age < 13;
                    const firstName = selectedDependent?.display_name?.split(' ')[0] || selectedStudent?.student_first_name;

                    return (
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0">
                            <div className="w-10 h-10 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full flex items-center justify-center">
                              <UserIcon className="w-5 h-5 text-white" />
                            </div>
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                              No Active Quests Yet
                            </h4>
                            {isDependent && isUnder13 ? (
                              <div className="text-sm text-gray-700 space-y-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                <p>
                                  {firstName} hasn't started any quests yet. To browse and start quests for them:
                                </p>
                                <ol className="list-decimal list-inside space-y-1 ml-2">
                                  <li>Click the "Act as {firstName}" button above</li>
                                  <li>Browse available quests in the Quest & Badge Hub</li>
                                  <li>Start quests that interest them</li>
                                  <li>Begin completing tasks and uploading evidence</li>
                                </ol>
                                <p className="text-xs text-gray-600 mt-3">
                                  Once quests are started, they'll appear here for easy tracking.
                                </p>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
                                <p>
                                  {firstName} hasn't started any quests yet. They can browse and start quests from their own dashboard.
                                </p>
                                <p className="text-xs text-gray-600 mt-3">
                                  Once they start quests, they'll appear here so you can track their progress and upload evidence to help them.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* XP by Pillar */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Learning Progress
                </h3>
                {progressData?.xp_by_pillar && Object.keys(progressData.xp_by_pillar).length > 0 ? (
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
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full flex items-center justify-center">
                          <CheckCircleIcon className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          Learning Progress Will Appear Here
                        </h4>
                        <div className="text-sm text-gray-700 space-y-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                          <p>
                            As {selectedStudent?.student_first_name || dependents.find(d => d.id === selectedStudentId)?.display_name?.split(' ')[0]} completes quest tasks, you'll see their progress tracked across five learning pillars:
                          </p>
                          <ul className="list-disc list-inside space-y-1 ml-2 text-gray-600">
                            <li><strong>Art</strong> - Creative expression and design</li>
                            <li><strong>STEM</strong> - Science, technology, engineering, math</li>
                            <li><strong>Wellness</strong> - Physical and mental well-being</li>
                            <li><strong>Communication</strong> - Writing, speaking, and connection</li>
                            <li><strong>Civics</strong> - Community engagement and citizenship</li>
                          </ul>
                          <p className="text-xs text-gray-600 mt-3">
                            Each completed task earns XP (experience points) in its related pillar. XP accumulates toward diploma credits (1,000 XP = 1 credit).
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

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

        </>
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
