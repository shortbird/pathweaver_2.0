import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useQuestDetail, useEnrollQuest, useCompleteTask, useEndQuest } from '../hooks/api/useQuests';
import { handleApiResponse } from '../utils/errorHandling';
import api from '../services/api';
import { getPillarData, normalizePillarKey } from '../utils/pillarMappings';
import { queryKeys } from '../utils/queryKeys';
import TaskEvidenceModal from '../components/quest/TaskEvidenceModal';
import TaskDetailModal from '../components/quest/TaskDetailModal';
import QuestPersonalizationWizard from '../components/quests/QuestPersonalizationWizard';
import SampleTaskCard from '../components/quest/SampleTaskCard';
import TaskLibraryView from '../components/quest-library/TaskLibraryView';
import { getQuestHeaderImageSync } from '../utils/questSourceConfig';
import { MapPin, Calendar, ExternalLink, Clock, Award, Users, CheckCircle, Circle, Target, BookOpen, Lock, UserPlus, ArrowLeft, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

const QuestDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Use React Query hooks for data fetching
  const {
    data: quest,
    isLoading,
    error,
    refetch: refetchQuest
  } = useQuestDetail(id, {
    enabled: !!id,
    staleTime: 0,
    cacheTime: 0,
  });

  // React Query mutations
  const enrollMutation = useEnrollQuest();
  const completeTaskMutation = useCompleteTask();
  const endQuestMutation = useEndQuest();

  // Get loading states from mutations
  const isEnrolling = enrollMutation.isPending;
  const isRefreshing = completeTaskMutation.isPending;

  // All features are now free for all users (Phase 2 refactoring - January 2025)
  const canStartQuests = true;
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [taskDetailToShow, setTaskDetailToShow] = useState(null);
  const [showPersonalizationWizard, setShowPersonalizationWizard] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState(new Set());

  // Task library state (for Optio quests)
  const [libraryCount, setLibraryCount] = useState(null);
  const [loadingLibraryCount, setLoadingLibraryCount] = useState(false);
  const [libraryTasks, setLibraryTasks] = useState([]);
  const [loadingLibraryTasks, setLoadingLibraryTasks] = useState(false);
  const [addingTaskId, setAddingTaskId] = useState(null);
  const [droppingTaskId, setDroppingTaskId] = useState(null);

  // Fetch library count for Optio quests
  useEffect(() => {
    const fetchLibraryCount = async () => {
      // Only fetch for Optio quests (not course quests)
      if (!quest || quest.source !== 'optio') return;

      setLoadingLibraryCount(true);
      try {
        const response = await api.get(`/api/quests/${id}/task-library/count`);
        setLibraryCount(response.data.count || 0);
      } catch (err) {
        console.error('Failed to fetch library count:', err);
        setLibraryCount(0); // Default to 0 on error
      } finally {
        setLoadingLibraryCount(false);
      }
    };

    fetchLibraryCount();
  }, [quest, id]);

  // Reusable function to refetch library tasks
  const refetchLibraryTasks = async () => {
    // Only fetch if user is enrolled in an Optio quest
    if (!quest || !quest.user_enrollment || quest.source !== 'optio') {
      setLibraryTasks([]);
      return;
    }

    setLoadingLibraryTasks(true);
    try {
      const response = await api.get(`/api/quests/${id}/task-library`);
      setLibraryTasks(response.data.tasks || []);
    } catch (err) {
      console.error('Failed to fetch library tasks:', err);
      setLibraryTasks([]);
    } finally {
      setLoadingLibraryTasks(false);
    }
  };

  // Fetch library tasks for enrolled Optio quests
  useEffect(() => {
    console.log('[LIBRARY] useEffect triggered:', {
      hasQuest: !!quest,
      hasEnrollment: !!quest?.user_enrollment,
      source: quest?.source,
      isOptio: quest?.source === 'optio',
      questId: quest?.id
    });
    refetchLibraryTasks();
  }, [quest, id]);

  // Handle error display
  if (error) {
    const errorMsg = error.response?.status === 404
      ? 'This quest could not be found. It may have been removed or is no longer available.'
      : error.response?.status === 403
      ? 'You do not have permission to view this quest.'
      : 'Unable to load quest details. Please refresh the page and try again.';

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Quest Not Found</h2>
          <p className="text-gray-600 mb-4">{errorMsg}</p>
          <button
            onClick={() => refetchQuest()}
            className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-lg transition-all mr-4"
          >
            Retry
          </button>
          <button
            onClick={() => navigate('/quests')}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all"
          >
            Back to Quests
          </button>
        </div>
      </div>
    );
  }

  const handleEnroll = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    enrollMutation.mutate(id, {
      onSuccess: async (data) => {

        // Force invalidate and refetch quest data
        queryClient.invalidateQueries(queryKeys.quests.detail(id));
        await refetchQuest();

        // Check if we should skip the personalization wizard (course quests)
        const skipWizard = data?.enrollment?.skip_wizard || data?.skip_wizard || false;
        const questType = data?.quest_type || 'optio';

        if (questType === 'course' || skipWizard) {
          // Course quest - tasks are already added, just show success
          toast.success('Enrolled! Your course tasks are ready.');
        } else {
          // Optio quest - check library count to decide flow
          if (libraryCount === 0) {
            // No library tasks available - show wizard immediately
            setTimeout(() => {
              setShowPersonalizationWizard(true);
            }, 100);
          } else {
            // Library has tasks - let user browse first, don't auto-show wizard
            toast.success('Enrolled! Browse the task library below or generate custom tasks.');
          }
        }
      },
      onError: (error) => {
        console.error('Enrollment failed:', error);
      }
    });
  };

  const handlePersonalizationComplete = async () => {
    setShowPersonalizationWizard(false);
    await refetchQuest(); // Reload quest with personalized tasks
    toast.success('Quest personalized successfully!');
  };

  const handlePersonalizationCancel = () => {
    setShowPersonalizationWizard(false);
  };

  const handleAddTask = async (sampleTaskId) => {
    setAddingTaskId(sampleTaskId);
    try {
      const response = await api.post(`/api/quests/${id}/task-library/select`, {
        sample_task_id: sampleTaskId
      });

      if (response.data.success) {
        // Invalidate React Query cache to force refetch
        queryClient.invalidateQueries(queryKeys.quests.detail(id));

        // Refetch quest data and library tasks
        await refetchQuest(); // Reload quest with new task
        await refetchLibraryTasks(); // Refresh library to remove added task

        toast.success('Task added to your quest!');
      }
    } catch (err) {
      console.error('Failed to add task:', err);
      toast.error(err.response?.data?.error || 'Failed to add task');
    } finally {
      setAddingTaskId(null);
    }
  };

  const handleDropTask = async (taskId) => {
    if (!window.confirm('Remove this task from your active quest? You can add it back later from the task library.')) {
      return;
    }

    console.log('[DROP TASK] Starting drop for task ID:', taskId);
    setDroppingTaskId(taskId);

    try {
      console.log('[DROP TASK] Calling DELETE /api/tasks/' + taskId);
      const response = await api.delete(`/api/tasks/${taskId}`);
      console.log('[DROP TASK] Delete response:', response.data);

      // Invalidate React Query cache to force refetch
      console.log('[DROP TASK] Invalidating query cache');
      queryClient.invalidateQueries(queryKeys.quests.detail(id));

      // Refetch quest data and library tasks
      console.log('[DROP TASK] Refetching quest data');
      const refetchResult = await refetchQuest();
      console.log('[DROP TASK] Refetch result:', refetchResult?.data?.quest_tasks?.length, 'tasks');
      console.log('[DROP TASK] Full refetch data:', {
        hasData: !!refetchResult?.data,
        questId: refetchResult?.data?.id,
        taskCount: refetchResult?.data?.quest_tasks?.length,
        taskIds: refetchResult?.data?.quest_tasks?.map(t => t.id.substring(0, 8)),
        droppedTaskStillPresent: refetchResult?.data?.quest_tasks?.some(t => t.id === taskId)
      });

      console.log('[DROP TASK] Refetching library tasks');
      await refetchLibraryTasks();
      console.log('[DROP TASK] Library refetch complete');

      toast.success('Task removed from your quest');
    } catch (err) {
      console.error('[DROP TASK] Error:', err);
      toast.error(err.response?.data?.error || 'Failed to remove task');
    } finally {
      console.log('[DROP TASK] Clearing dropping state');
      setDroppingTaskId(null);
    }
  };

  const handleEndQuest = async () => {
    if (!quest.user_enrollment) return;

    if (window.confirm('Are you sure you want to finish this quest? This will end your active enrollment and save your progress.')) {
      endQuestMutation.mutate(id, {
        onSuccess: () => {
          navigate('/diploma'); // Navigate to diploma to show achievement
        }
      });
    }
  };

  const handleTaskCompletion = async (completionData) => {
    // Task is already completed by MultiFormatEvidenceEditor
    // Optimistically update the task completion status in cache
    if (selectedTask) {
      queryClient.setQueryData(queryKeys.quests.detail(id), (oldData) => {
        if (!oldData) return oldData;

        const updatedTasks = oldData.quest_tasks?.map(task =>
          task.id === selectedTask.id
            ? { ...task, is_completed: true }
            : task
        ) || [];

        // Recalculate completion status
        const completedCount = updatedTasks.filter(task => task.is_completed).length;
        const totalCount = updatedTasks.length;
        const newProgressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
        const isNewlyCompleted = newProgressPercentage === 100;

        return {
          ...oldData,
          quest_tasks: updatedTasks,
          progress: {
            ...oldData.progress,
            percentage: newProgressPercentage,
            completed_tasks: completedCount,
            total_tasks: totalCount
          },
          completed_enrollment: isNewlyCompleted ? true : oldData.completed_enrollment
        };
      });
    }

    setShowTaskModal(false);
    setSelectedTask(null);

    // Also trigger a background refetch to sync with server
    refetchQuest();
  };

  // Collaboration functions removed in Phase 3 refactoring (January 2025)

  const toggleTaskExpansion = (taskId) => {
    const newExpanded = new Set(expandedTasks);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedTasks(newExpanded);
  };

  const calculateXP = () => {
    if (!quest?.quest_tasks) return { baseXP: 0, totalXP: 0, earnedXP: 0 };

    const tasks = quest.quest_tasks;
    const baseXP = tasks.reduce((sum, task) => sum + (task.xp_amount || 0), 0);
    const earnedXP = tasks
      .filter(task => task.is_completed)
      .reduce((sum, task) => sum + (task.xp_amount || 0), 0);

    const totalXP = baseXP;

    return { baseXP, totalXP, earnedXP };
  };

  const getPillarBreakdown = () => {
    if (!quest?.quest_tasks) return {};

    const breakdown = {};
    quest.quest_tasks.forEach(task => {
      const rawPillar = task.pillar || 'wellness';
      // Normalize pillar key to handle legacy naming (e.g., "Arts & Creativity" -> "art")
      const normalizedPillar = normalizePillarKey(rawPillar);

      if (!breakdown[normalizedPillar]) {
        breakdown[normalizedPillar] = 0;
      }
      breakdown[normalizedPillar] += task.xp_amount || 0;
    });

    return breakdown;
  };

  const getLocationDisplay = () => {
    if (!quest?.metadata) return null;
    
    const { location_type, venue_name, location_address } = quest.metadata;
    
    if (location_type === 'anywhere') return 'Anywhere';
    if (location_type === 'specific_location') {
      if (venue_name && location_address) {
        return `${venue_name}, ${location_address}`;
      } else if (venue_name) {
        return venue_name;
      } else if (location_address) {
        return location_address;
      }
    }
    
    return null;
  };

  const getSeasonalDisplay = () => {
    if (!quest?.metadata?.seasonal_start) return null;
    
    const startDate = new Date(quest.metadata.seasonal_start).toLocaleDateString();
    const endDate = quest.metadata.seasonal_end ? 
      new Date(quest.metadata.seasonal_end).toLocaleDateString() : 'Ongoing';
    
    return `${startDate} - ${endDate}`;
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="bg-gray-300 rounded-xl h-64 mb-8"></div>
          <div className="space-y-4">
            <div className="h-6 bg-gray-300 rounded w-3/4"></div>
            <div className="h-4 bg-gray-300 rounded w-1/2"></div>
            <div className="h-32 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !quest) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">{error || 'Quest not found'}</div>
          <button 
            onClick={() => navigate('/quests')}
            className="bg-gradient-primary text-white px-6 py-3 rounded-[30px] hover:shadow-lg transition-all"
          >
            Back to Quests
          </button>
        </div>
      </div>
    );
  }

  const completedTasks = quest.quest_tasks?.filter(task => task.is_completed).length || 0;
  const totalTasks = quest.quest_tasks?.length || 0;
  const progressPercentage = quest.progress?.percentage || (totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0);
  const isQuestCompleted = quest.completed_enrollment || (quest.progress && quest.progress.percentage === 100);
  const { baseXP, totalXP, earnedXP } = calculateXP();
  const pillarBreakdown = getPillarBreakdown();
  const locationDisplay = getLocationDisplay();
  const seasonalDisplay = getSeasonalDisplay();

  // Get quest header image
  const questImage = quest.image_url || quest.header_image_url || getQuestHeaderImageSync(quest.source);

  return (
    <div className="min-h-screen bg-gray-50 pt-[50px] sm:pt-0">
      {/* Hero Section with Background Image */}
      <div className="relative min-h-[500px] w-full overflow-hidden pb-8">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${questImage})` }}
        />

        {/* Left-to-right gradient overlay (white to transparent) */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent" />

        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          {/* Back Button and View on Diploma Button */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white rounded-full hover:shadow-lg transition-all font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              BACK
            </button>

            {/* View on Diploma button - show if user has completed any tasks */}
            {user && completedTasks > 0 && (
              <button
                onClick={() => navigate(`/diploma/${user.id}`)}
                className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm text-purple-600 border-2 border-purple-200 rounded-full hover:bg-white hover:border-purple-300 hover:shadow-lg transition-all font-semibold"
                style={{ fontFamily: 'Poppins' }}
              >
                <BookOpen className="w-4 h-4" />
                VIEW ON DIPLOMA
              </button>
            )}
          </div>

          {/* Quest Title and Description */}
          <div className="max-w-2xl mb-6">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins' }}>
              {quest.title}
            </h1>
            <p className="text-lg text-gray-700 leading-relaxed mb-6" style={{ fontFamily: 'Poppins' }}>
              {quest.big_idea || quest.description}
            </p>
          </div>

          {/* Quest Metadata */}
          <div className="max-w-2xl mb-6">
            <div className="flex flex-wrap gap-4 items-center text-sm mb-4">
              {locationDisplay && (
                <div className="flex items-center gap-2 text-gray-700">
                  <MapPin className="w-4 h-4" />
                  <span>{locationDisplay}</span>
                </div>
              )}

              {seasonalDisplay && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="w-4 h-4" />
                  <span>{seasonalDisplay}</span>
                </div>
              )}
            </div>

            {/* Pillar XP Breakdown */}
            {Object.keys(pillarBreakdown).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(pillarBreakdown).map(([pillar, xp]) => {
                  const pillarData = getPillarData(pillar);
                  return (
                    <div
                      key={pillar}
                      className={`px-3 py-1 rounded-full text-sm font-medium ${pillarData.bg} ${pillarData.text}`}
                    >
                      {pillarData.icon} {pillarData.name}: {xp} XP
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Progress Bar and Stats */}
          {(quest.user_enrollment || isQuestCompleted) && (
            <div className="max-w-2xl">
              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-6 mb-4 overflow-hidden relative">
                <div
                  className="h-full bg-gradient-primary rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercentage}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-700" style={{ fontFamily: 'Poppins' }}>
                  {Math.round(progressPercentage)}%
                </div>
              </div>

              {/* Stats Row with Set Down Quest Button */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="px-4 py-2 bg-green-50 border-2 border-green-200 rounded-lg text-center">
                  <div className="text-xl font-bold text-green-700" style={{ fontFamily: 'Poppins' }}>{completedTasks}</div>
                  <div className="text-xs text-green-600 font-medium uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>Completed</div>
                </div>
                <div className="px-4 py-2 bg-blue-50 border-2 border-blue-200 rounded-lg text-center">
                  <div className="text-xl font-bold text-blue-700" style={{ fontFamily: 'Poppins' }}>{totalTasks - completedTasks}</div>
                  <div className="text-xs text-blue-600 font-medium uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>Remaining</div>
                </div>
                <div className="px-4 py-2 bg-purple-50 border-2 border-purple-200 rounded-lg text-center">
                  <div className="text-xl font-bold text-purple-700" style={{ fontFamily: 'Poppins' }}>{earnedXP}</div>
                  <div className="text-xs text-purple-600 font-medium uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>XP Earned</div>
                </div>
                <div className="px-4 py-2 bg-gray-100 border-2 border-gray-300 rounded-lg text-center">
                  <div className="text-xl font-bold text-gray-700" style={{ fontFamily: 'Poppins' }}>{completedTasks}/{totalTasks}</div>
                  <div className="text-xs text-gray-600 font-medium uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>Tasks</div>
                </div>

                {/* Set Down Quest Button - In same row as stats */}
                {quest.user_enrollment && !isQuestCompleted && (
                  <button
                    onClick={handleEndQuest}
                    disabled={endQuestMutation.isPending}
                    className="px-6 py-2 bg-gradient-primary text-white rounded-full hover:shadow-lg transition-all font-bold disabled:opacity-50 ml-auto"
                    style={{ fontFamily: 'Poppins' }}
                  >
                    {endQuestMutation.isPending ? 'Setting Down...' : 'SET DOWN QUEST'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* Collaboration status removed in Phase 3 refactoring (January 2025) */}

      {/* 4. Call-to-Action Buttons */}
      {(isQuestCompleted || !quest.user_enrollment || (quest.user_enrollment && totalTasks === 0)) && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex gap-4">
            {isQuestCompleted ? (
              // Completed quests can be picked up again
              <button
                onClick={handleEnroll}
                disabled={isEnrolling}
                className="flex-1 bg-gradient-primary text-white py-4 px-8 rounded-[30px] hover:shadow-[0_8px_30px_rgba(239,89,123,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Target className="w-5 h-5 inline mr-2" />
                {isEnrolling ? 'Picking Up...' : 'Pick Up Quest'}
              </button>
            ) : quest.user_enrollment && totalTasks === 0 ? (
              <button
                onClick={() => setShowPersonalizationWizard(true)}
                className="flex-1 bg-gradient-to-r from-[#6d469b] to-[#8b5cf6] text-white py-4 px-8 rounded-[30px] hover:shadow-[0_8px_30px_rgba(109,70,155,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold text-lg"
              >
                <Target className="w-5 h-5 inline mr-2" />
                Personalize Quest
              </button>
            ) : !quest.user_enrollment ? (
              <>
                {canStartQuests ? (
                  // Paid tier users - show start button only
                  <button
                    onClick={handleEnroll}
                    disabled={isEnrolling}
                    className="flex-1 bg-gradient-primary text-white py-4 px-8 rounded-[30px] hover:shadow-[0_8px_30px_rgba(239,89,123,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Target className="w-5 h-5 inline mr-2" />
                    {isEnrolling ? 'Picking Up...' : 'Pick Up Quest'}
                  </button>
                ) : (
                  // Free tier users - show upgrade button
                  <button
                    onClick={() => navigate('/subscription')}
                    className="flex-1 bg-gray-100 text-gray-600 py-4 px-8 rounded-[30px] hover:bg-gray-200 transition-all duration-300 font-bold text-lg border-2 border-gray-300"
                  >
                    <Lock className="w-5 h-5 inline mr-2" />
                    Upgrade to Start
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

        {/* Task Cards Grid */}
        <div className="mb-8">
          {quest.quest_tasks && quest.quest_tasks.length > 0 ? (
            <>
              {/* Active Tasks Section */}
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>
                  Active Tasks
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {[...quest.quest_tasks]
                    .sort((a, b) => {
                      // Sort incomplete tasks first, completed tasks last
                      if (a.is_completed === b.is_completed) return 0;
                      return a.is_completed ? 1 : -1;
                    })
                    .map((task) => {
                    const pillarData = getPillarData(task.pillar);

                    return (
                      <div
                        key={task.id}
                        className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group transition-all hover:shadow-lg"
                        style={{
                          background: task.is_completed
                            ? pillarData.color
                            : `linear-gradient(to right, #ffffff 0%, ${pillarData.color}30 100%)`
                        }}
                      >
                        {/* Task Content */}
                        <div
                          onClick={() => {
                            if (quest.user_enrollment) {
                              setSelectedTask(task);
                              setShowTaskModal(true);
                            } else {
                              setTaskDetailToShow(task);
                              setShowTaskDetailModal(true);
                            }
                          }}
                          className="absolute inset-0 p-3 flex flex-col justify-between"
                        >
                          {/* Top Section - Pillar Name Pill */}
                          <div>
                            <div
                              className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={{
                                backgroundColor: task.is_completed ? 'rgba(255,255,255,0.3)' : pillarData.color,
                                color: 'white',
                                fontFamily: 'Poppins'
                              }}
                            >
                              {pillarData.name}
                            </div>
                          </div>

                          {/* Middle Section - Task Title */}
                          <div className="flex-1 flex items-center justify-center px-2">
                            <h3
                              className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-center leading-tight uppercase"
                              style={{
                                fontFamily: 'Poppins',
                                color: task.is_completed ? 'white' : '#333',
                                textDecoration: task.is_completed ? 'line-through' : 'none'
                              }}
                            >
                              {task.title}
                            </h3>
                          </div>

                          {/* Bottom Section - XP Pill */}
                          <div className="flex justify-center">
                            <div
                              className="px-2 py-0.5 rounded-full text-xs font-bold"
                              style={{
                                backgroundColor: task.is_completed ? 'rgba(255,255,255,0.3)' : pillarData.color,
                                color: 'white',
                                fontFamily: 'Poppins'
                              }}
                            >
                              {task.xp_amount} XP
                            </div>
                          </div>
                        </div>

                        {/* Continue Button for Incomplete Tasks */}
                        {!task.is_completed && quest.user_enrollment && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTask(task);
                              setShowTaskModal(true);
                            }}
                            className="absolute bottom-2 left-2 right-2 py-1.5 rounded-full font-bold text-xs uppercase tracking-wide text-white transition-all hover:shadow-lg"
                            style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                          >
                            Continue
                          </button>
                        )}

                        {/* Edit Evidence Button for Completed Tasks */}
                        {task.is_completed && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTask(task);
                              setShowTaskModal(true);
                            }}
                            className="absolute bottom-2 left-2 right-2 py-1.5 bg-white/90 text-gray-800 rounded-full font-bold text-xs uppercase tracking-wide transition-all hover:bg-white"
                            style={{ fontFamily: 'Poppins' }}
                          >
                            Edit Evidence
                          </button>
                        )}

                        {/* Drop Task Button - top right corner */}
                        {quest.user_enrollment && !isQuestCompleted && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDropTask(task.id);
                            }}
                            disabled={droppingTaskId === task.id}
                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all disabled:opacity-50"
                            title="Remove from active tasks"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Add Task Card - only show if enrolled and not completed */}
                  {quest.user_enrollment && !isQuestCompleted && (
                    <div
                      onClick={() => setShowPersonalizationWizard(true)}
                      className="aspect-square rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-lg border-4 border-black bg-white flex flex-col items-center justify-center gap-2 text-black group hover:bg-gray-50"
                    >
                      <Plus className="w-10 h-10 transition-transform group-hover:scale-110" />
                      <div className="text-xs font-bold uppercase tracking-wide text-center px-2" style={{ fontFamily: 'Poppins' }}>
                        Add Task
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </>
          ) : null}

          {/* Task Library Section - ALWAYS show if enrolled in active Optio quest */}
          {(() => {
            const showLibrary = quest.user_enrollment && quest.source === 'optio' && !isQuestCompleted;
            console.log('[LIBRARY] Render conditions:', {
              hasEnrollment: !!quest.user_enrollment,
              enrollment: quest.user_enrollment,
              source: quest.source,
              isOptio: quest.source === 'optio',
              isQuestCompleted,
              completedEnrollment: quest.completed_enrollment,
              progressPercentage: quest.progress?.percentage,
              showLibrary,
              libraryTasksLength: libraryTasks.length
            });
            return showLibrary;
          })() && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>
                Task Library
              </h2>

              {loadingLibraryTasks ? (
                <div className="text-center py-8">
                  <div className="animate-pulse">
                    <div className="h-6 bg-gray-300 rounded w-1/3 mx-auto"></div>
                  </div>
                </div>
              ) : libraryTasks.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {libraryTasks.map((task) => {
                    const pillarData = getPillarData(task.pillar);
                    const isAdding = addingTaskId === task.id;

                    return (
                      <div
                        key={task.id}
                        className="border-2 border-gray-200 rounded-xl p-5 hover:shadow-lg transition-all bg-white"
                      >
                        {/* Task Title */}
                        <h4 className="font-bold text-lg mb-2 line-clamp-2" style={{ fontFamily: 'Poppins' }}>
                          {task.title}
                        </h4>

                        {/* Task Description */}
                        <p className="text-gray-600 text-sm mb-4 line-clamp-3" style={{ fontFamily: 'Poppins' }}>
                          {task.description}
                        </p>

                        {/* Badges */}
                        <div className="flex items-center gap-2 mb-4">
                          <div className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: pillarData.color, color: 'white' }}>
                            {pillarData.name}
                          </div>
                          <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                            {task.xp_value} XP
                          </div>
                        </div>

                        {/* Add Task Button */}
                        <button
                          onClick={() => handleAddTask(task.id)}
                          disabled={isAdding}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all disabled:opacity-50 font-semibold"
                          style={{ fontFamily: 'Poppins' }}
                        >
                          {isAdding ? (
                            'Adding...'
                          ) : (
                            <>
                              <Plus className="w-4 h-4" />
                              Add Task
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                  <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                  <p className="text-gray-600 mb-2" style={{ fontFamily: 'Poppins' }}>
                    No additional tasks available yet
                  </p>
                  <p className="text-sm text-gray-500 max-w-md mx-auto" style={{ fontFamily: 'Poppins' }}>
                    {quest.quest_tasks && quest.quest_tasks.length > 0
                      ? "You've added all available tasks from the library. Generate more custom tasks to continue learning!"
                      : "This quest doesn't have any pre-generated tasks yet. Generate your first set of personalized tasks!"}
                  </p>
                  <button
                    onClick={() => setShowPersonalizationWizard(true)}
                    className="mt-4 px-6 py-2 bg-gradient-primary text-white rounded-lg font-semibold hover:opacity-90"
                    style={{ fontFamily: 'Poppins' }}
                  >
                    Generate More Tasks
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Enrollment flow for users without tasks */}
          {quest.quest_tasks && quest.quest_tasks.length === 0 && quest.user_enrollment && !showPersonalizationWizard ? (
            loadingLibraryCount ? (
              <div className="text-center py-12">
                <div className="animate-pulse">
                  <div className="h-8 bg-gray-300 rounded w-1/2 mx-auto mb-4"></div>
                  <div className="h-4 bg-gray-300 rounded w-1/3 mx-auto"></div>
                </div>
              </div>
            ) : libraryCount === 0 ? (
              // No library tasks available - show generate CTA
              <div className="text-center py-12 bg-white rounded-xl shadow-md">
                <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg text-gray-600 mb-2" style={{ fontFamily: 'Poppins' }}>
                  This quest has no pre-generated tasks yet.
                </p>
                <p className="text-sm text-gray-500 mb-6" style={{ fontFamily: 'Poppins' }}>
                  Be the first to create personalized tasks for this quest!
                </p>
                <button
                  onClick={() => setShowPersonalizationWizard(true)}
                  className="px-6 py-3 bg-gradient-primary text-white rounded-lg font-semibold hover:opacity-90"
                  style={{ fontFamily: 'Poppins' }}
                >
                  Generate Personalized Tasks
                </button>
              </div>
            ) : (
              // Library has tasks - show TaskLibraryView
              <div className="mb-8">
                <TaskLibraryView
                  questId={id}
                  onTaskAdded={() => {
                    refetchQuest();
                    toast.success('Task added to your quest!');
                  }}
                  onGenerateCustom={() => setShowPersonalizationWizard(true)}
                />
              </div>
            )
          ) : !quest.user_enrollment ? (
            <>
              {/* Show sample tasks for Optio quests OR preset tasks for Course quests */}
              {quest.quest_type === 'optio' && quest.sample_tasks && quest.sample_tasks.length > 0 ? (
                <div className="mb-8">
                  {/* Section Header */}
                  <div className="text-center mb-6">
                    <h2 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
                      Sample Tasks for Inspiration
                    </h2>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins' }}>
                      These spark ideas. Choose what resonates or create your own path!
                    </p>
                  </div>

                  {/* Sample Tasks Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {quest.sample_tasks.map((task) => (
                      <SampleTaskCard
                        key={task.id}
                        task={task}
                        onAdd={async (sampleTask) => {
                          // User must enroll first before adding sample tasks
                          toast.error('Please pick up this quest first, then you can add sample tasks!');
                        }}
                        disabled={true}
                      />
                    ))}
                  </div>
                </div>
              ) : quest.quest_type === 'course' && quest.preset_tasks && quest.preset_tasks.length > 0 ? (
                <div className="mb-8">
                  {/* Section Header */}
                  <div className="text-center mb-6">
                    <h2 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
                      Required Tasks
                    </h2>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto" style={{ fontFamily: 'Poppins' }}>
                      This course has preset tasks aligned with the curriculum
                    </p>
                  </div>

                  {/* Preset Tasks List */}
                  <div className="space-y-3">
                    {quest.preset_tasks.map((task, index) => {
                      const pillarData = getPillarData(task.pillar);
                      return (
                        <div
                          key={task.id}
                          className="bg-white rounded-xl p-4 border-2 border-gray-100 hover:border-gray-200 transition-all"
                        >
                          <div className="flex items-start gap-4">
                            {/* Order Number */}
                            <div
                              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
                              style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                            >
                              {index + 1}
                            </div>

                            {/* Task Content */}
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>
                                  {task.title}
                                </h3>
                                <div
                                  className="px-2 py-0.5 rounded-full text-xs font-semibold"
                                  style={{
                                    backgroundColor: `${pillarData.color}20`,
                                    color: pillarData.color,
                                    fontFamily: 'Poppins'
                                  }}
                                >
                                  {pillarData.name}
                                </div>
                                <div
                                  className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                                  style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                                >
                                  {task.xp_value} XP
                                </div>
                              </div>
                              {task.description && (
                                <p className="text-sm text-gray-700" style={{ fontFamily: 'Poppins' }}>
                                  {task.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-xl shadow-md text-gray-500">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Start this quest to see tasks</p>
                </div>
              )}
            </>
          ) : null}
        </div>


      </div>
      {/* End Main Content Container */}

      {/* Modals */}
      {showTaskModal && selectedTask && (
        <TaskEvidenceModal
          task={selectedTask}
          questId={quest.id}
          onComplete={handleTaskCompletion}
          onClose={() => setShowTaskModal(false)}
        />
      )}

      {showTaskDetailModal && (
        <TaskDetailModal
          task={taskDetailToShow}
          isOpen={showTaskDetailModal}
          onClose={() => {
            setShowTaskDetailModal(false);
            setTaskDetailToShow(null);
          }}
        />
      )}

      {/* Team-up modal removed in Phase 3 refactoring (January 2025) */}

      {showPersonalizationWizard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <QuestPersonalizationWizard
              questId={quest.id}
              questTitle={quest.title}
              onComplete={handlePersonalizationComplete}
              onCancel={handlePersonalizationCancel}
            />
          </div>
        </div>
      )}

    </div>
  );
};

export default QuestDetail;