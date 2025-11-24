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
import TutorialTaskInstructionsModal from '../components/quest/TutorialTaskInstructionsModal';
import QuestPersonalizationWizard from '../components/quests/QuestPersonalizationWizard';
import SampleTaskCard from '../components/quest/SampleTaskCard';
import TaskTimeline from '../components/quest/TaskTimeline';
import TaskWorkspace from '../components/quest/TaskWorkspace';
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
  const [droppingTaskId, setDroppingTaskId] = useState(null);
  const [displayMode, setDisplayMode] = useState('flexible'); // 'timeline' or 'flexible'
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);

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
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Quest Not Found</h2>
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
          // Optio quest - always show personalization wizard
          setTimeout(() => {
            setShowPersonalizationWizard(true);
          }, 100);
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

  const handleDropTask = async (taskId) => {
    if (!window.confirm('Remove this task from your active quest? You can add it back later from the task library.')) {
      return;
    }

    setDroppingTaskId(taskId);

    try {
      await api.delete(`/api/tasks/${taskId}`);

      // Invalidate React Query cache to force refetch
      queryClient.invalidateQueries(queryKeys.quests.detail(id));

      // Refetch quest data
      await refetchQuest();

      toast.success('Task removed from your quest');
    } catch (err) {
      console.error('Error removing task:', err);
      toast.error(err.response?.data?.error || 'Failed to remove task');
    } finally {
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

  const handleTaskReorder = async (oldIndex, newIndex) => {
    if (!quest?.quest_tasks) return;

    // Optimistically reorder tasks in UI
    const reorderedTasks = Array.from(quest.quest_tasks);
    const [movedTask] = reorderedTasks.splice(oldIndex, 1);
    reorderedTasks.splice(newIndex, 0, movedTask);

    // Update order_index for all tasks
    const updatedTasks = reorderedTasks.map((task, index) => ({
      ...task,
      order_index: index
    }));

    // Optimistically update cache
    queryClient.setQueryData(queryKeys.quests.detail(id), (oldData) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        quest_tasks: updatedTasks
      };
    });

    // Persist to backend
    try {
      await api.put(`/api/quests/${id}/tasks/reorder`, {
        task_ids: updatedTasks.map(t => t.id)
      });
    } catch (err) {
      console.error('Error reordering tasks:', err);
      toast.error('Failed to save task order');
      // Revert on error
      refetchQuest();
    }
  };

  const handleDisplayModeChange = async (newMode) => {
    setDisplayMode(newMode);

    // Persist to backend
    try {
      await api.put(`/api/quests/${id}/display-mode`, {
        display_mode: newMode
      });
    } catch (err) {
      console.error('Error updating display mode:', err);
      // Silently fail - not critical
    }
  };

  const handleTaskSelect = (task) => {
    setSelectedTask(task);
    // Close mobile drawer when task is selected
    if (window.innerWidth < 768) {
      setShowMobileDrawer(false);
    }
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
  const questImage = quest.image_url || quest.header_image_url || getQuestHeaderImageSync(quest.quest_type);

  // Check if this is a Spark LMS quest
  const isSparkQuest = quest.lms_platform === 'spark';
  const sparkLogoUrl = 'https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/logos/onfire.png';

  return (
    <div className="min-h-screen bg-gray-50 pt-[50px] sm:pt-0">
      {/* Hero Section with Background Image or White (Spark) */}
      <div className="relative min-h-[500px] w-full overflow-hidden pb-8">
        {isSparkQuest ? (
          // Spark LMS: White background with logo on right
          <>
            <div className="absolute inset-0 bg-white" />
            {/* Spark Logo - Right Side */}
            <div
              className="absolute right-0 top-0 bottom-0 w-1/3 bg-no-repeat bg-right bg-contain opacity-20"
              style={{ backgroundImage: `url(${sparkLogoUrl})` }}
            />
          </>
        ) : (
          // Regular quest: Background Image
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${questImage})` }}
            />
            {/* Left-to-right gradient overlay (white to transparent) */}
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent" />
          </>
        )}

        {/* Content */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          {/* Back Button and View on Diploma Button */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              style={{ fontFamily: 'Poppins' }}
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

            {/* Visit Course Button - Only show for course quests with material_link */}
            {quest.quest_type === 'course' && quest.material_link && (
              <a
                href={quest.material_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full hover:shadow-lg hover:scale-105 transition-all duration-300 font-semibold text-base w-full sm:w-auto justify-center"
                style={{ fontFamily: 'Poppins' }}
              >
                <ExternalLink className="w-5 h-5" />
                VISIT COURSE
              </a>
            )}
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

                {/* Set Down Quest / Mark Completed Button - In same row as stats */}
                {quest.user_enrollment && !isQuestCompleted && (
                  quest.lms_platform ? (
                    // LMS-linked quests show "Mark Quest Completed" button
                    <button
                      onClick={() => {
                        if (window.confirm('⚠️ Only mark this quest as completed if you are finished with the associated LMS class.\n\nIf you submit more evidence to this quest later, it will automatically be reactivated.')) {
                          handleEndQuest();
                        }
                      }}
                      disabled={endQuestMutation.isPending}
                      className="px-6 py-2 bg-gradient-primary text-white rounded-full hover:shadow-lg transition-all font-bold disabled:opacity-50 ml-auto"
                      style={{ fontFamily: 'Poppins' }}
                    >
                      {endQuestMutation.isPending ? 'Marking Complete...' : 'MARK QUEST COMPLETED'}
                    </button>
                  ) : (
                    // Optio quests show regular "Set Down Quest" button
                    <button
                      onClick={handleEndQuest}
                      disabled={endQuestMutation.isPending}
                      className="px-6 py-2 bg-gradient-primary text-white rounded-full hover:shadow-lg transition-all font-bold disabled:opacity-50 ml-auto"
                      style={{ fontFamily: 'Poppins' }}
                    >
                      {endQuestMutation.isPending ? 'Setting Down...' : 'SET DOWN QUEST'}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* Collaboration status removed in Phase 3 refactoring (January 2025) */}

      {/* 4. Call-to-Action Buttons - Hide for LMS-linked quests (auto-enrolled via SSO) */}
      {!quest.lms_platform && (isQuestCompleted || !quest.user_enrollment || (quest.user_enrollment && totalTasks === 0)) && (
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
              <button
                onClick={handleEnroll}
                disabled={isEnrolling}
                className="flex-1 bg-gradient-primary text-white py-4 px-8 rounded-[30px] hover:shadow-[0_8px_30px_rgba(239,89,123,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Target className="w-5 h-5 inline mr-2" />
                {isEnrolling ? 'Picking Up...' : 'Pick Up Quest'}
              </button>
            ) : null}
          </div>
        </div>
      )}

        {/* Two-Column Task Display */}
        {quest.user_enrollment && quest.quest_tasks && quest.quest_tasks.length > 0 ? (
          <div className="flex gap-6 h-[calc(100vh-400px)] min-h-[600px]">
            {/* Left Column: Task Timeline (22%) */}
            <div className="w-[22%] bg-white rounded-xl shadow-md overflow-hidden hidden md:block">
              <TaskTimeline
                tasks={quest.quest_tasks}
                selectedTaskId={selectedTask?.id}
                onTaskSelect={handleTaskSelect}
                onTaskReorder={handleTaskReorder}
                onAddTask={() => setShowPersonalizationWizard(true)}
                displayMode={displayMode}
                onDisplayModeChange={handleDisplayModeChange}
              />
            </div>

            {/* Right Column: Task Workspace (78%) */}
            <div className="flex-1 bg-white rounded-xl shadow-md overflow-hidden">
              <TaskWorkspace
                task={selectedTask}
                questId={quest.id}
                onTaskComplete={handleTaskCompletion}
                onClose={() => setSelectedTask(null)}
              />
            </div>

            {/* Mobile: Show task timeline as drawer */}
            {showMobileDrawer && (
              <div className="fixed inset-0 z-50 md:hidden">
                <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowMobileDrawer(false)} />
                <div className="absolute left-0 top-0 bottom-0 w-80 bg-white shadow-xl">
                  <TaskTimeline
                    tasks={quest.quest_tasks}
                    selectedTaskId={selectedTask?.id}
                    onTaskSelect={handleTaskSelect}
                    onTaskReorder={handleTaskReorder}
                    onAddTask={() => setShowPersonalizationWizard(true)}
                    displayMode={displayMode}
                    onDisplayModeChange={handleDisplayModeChange}
                  />
                </div>
              </div>
            )}
          </div>
        ) : quest.quest_tasks && quest.quest_tasks.length > 0 && !quest.user_enrollment ? (
            <>
              {/* Show sample tasks preview for non-enrolled users */}
              <div className="mb-8">
                  <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>
                    Active Tasks
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {quest.quest_tasks
                      .filter(task => !task.is_completed)
                      .map((task) => {
                    const pillarData = getPillarData(task.pillar);

                    return (
                      <div
                        key={task.id}
                        className="relative rounded-xl overflow-hidden transition-all hover:shadow-lg border-2 border-gray-100 hover:border-gray-200"
                        style={{
                          background: task.is_completed
                            ? `linear-gradient(135deg, ${pillarData.color}30 0%, ${pillarData.color}20 100%)`
                            : `linear-gradient(135deg, ${pillarData.color}15 0%, ${pillarData.color}05 100%)`
                        }}
                      >
                        {/* Card Content */}
                        <div
                          onClick={() => {
                            // Allow opening modal for tutorial tasks to show instructions
                            if (quest.user_enrollment) {
                              setSelectedTask(task);
                              setShowTaskModal(true);
                            } else {
                              setTaskDetailToShow(task);
                              setShowTaskDetailModal(true);
                            }
                          }}
                          className="p-4 cursor-pointer"
                        >
                          {/* Completed Badge (top right if completed) */}
                          {task.is_completed && (
                            <div className="absolute top-3 right-3">
                              <div className="px-3 py-1 bg-green-500 text-white rounded-full text-xs font-bold" style={{ fontFamily: 'Poppins' }}>
                                COMPLETED
                              </div>
                            </div>
                          )}

                          {/* Task Title */}
                          <h3
                            className="text-lg font-bold text-gray-900 mb-2 leading-tight pr-24"
                            style={{ fontFamily: 'Poppins' }}
                          >
                            {task.title}
                          </h3>

                          {/* Task Description */}
                          {task.description && (
                            <p className="text-sm text-gray-700 mb-3 line-clamp-2" style={{ fontFamily: 'Poppins' }}>
                              {task.description}
                            </p>
                          )}

                          {/* Pillar Badge + XP Badge Row */}
                          <div className="flex items-center gap-2 mb-3">
                            <div
                              className="inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-semibold text-white"
                              style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                            >
                              {pillarData.name}
                            </div>
                            <div
                              className="px-3 py-1 rounded-full text-sm font-bold"
                              style={{
                                backgroundColor: `${pillarData.color}20`,
                                color: pillarData.color
                              }}
                            >
                              {task.xp_amount} XP
                            </div>
                          </div>
                          {/* Action Buttons */}
                          <div className="px-4 pb-4">
                            {/* Continue Button for Incomplete Tasks (hide for auto-complete tasks) */}
                            {!task.is_completed && quest.user_enrollment && !task.auto_complete && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTask(task);
                                  setShowTaskModal(true);
                                }}
                                className="w-full py-2.5 rounded-full font-bold text-sm uppercase tracking-wide text-white transition-all hover:shadow-md"
                                style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                              >
                                Continue
                              </button>
                            )}

                            {/* View Instructions button for incomplete tutorial tasks */}
                            {!task.is_completed && quest.user_enrollment && task.auto_complete && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTask(task);
                                  setShowTaskModal(true);
                                }}
                                className="w-full py-2.5 rounded-full font-bold text-sm uppercase tracking-wide text-white transition-all hover:shadow-md"
                                style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                              >
                                View Instructions
                              </button>
                            )}

                            {/* Edit Evidence Button for Completed Tasks (hide for tutorial tasks) */}
                            {task.is_completed && !task.auto_complete && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTask(task);
                                  setShowTaskModal(true);
                                }}
                                className="w-full py-2.5 bg-white text-gray-800 border-2 border-gray-300 rounded-full font-bold text-sm uppercase tracking-wide transition-all hover:border-gray-400"
                                style={{ fontFamily: 'Poppins' }}
                              >
                                Edit Evidence
                              </button>
                            )}

                            {/* Completed badge for auto-verified tasks */}
                            {task.is_completed && task.auto_complete && (
                              <div
                                className="w-full py-2.5 bg-green-100 text-green-700 border-2 border-green-300 rounded-full font-bold text-sm uppercase tracking-wide text-center"
                                style={{ fontFamily: 'Poppins' }}
                              >
                                ✅ Completed!
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Drop Task Button - top right corner (hide for tutorial tasks and completed tasks) */}
                        {quest.user_enrollment && !isQuestCompleted && !task.auto_complete && !task.is_completed && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDropTask(task.id);
                            }}
                            disabled={droppingTaskId === task.id}
                            className="absolute top-3 right-3 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all disabled:opacity-50 z-10"
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
                      className="relative rounded-xl overflow-hidden cursor-pointer transition-all hover:shadow-lg border-2 border-dashed border-gray-400 bg-white hover:border-optio-purple hover:bg-purple-50 group"
                    >
                      <div className="p-4 flex flex-col items-center justify-center h-full min-h-[200px]">
                        <Plus className="w-12 h-12 text-gray-400 group-hover:text-optio-purple transition-all group-hover:scale-110 mb-3" />
                        <div className="text-lg font-bold text-gray-700 group-hover:text-optio-purple transition-colors" style={{ fontFamily: 'Poppins' }}>
                          Add Task
                        </div>
                        <p className="text-sm text-gray-500 text-center mt-2" style={{ fontFamily: 'Poppins' }}>
                          Generate with AI, write your own, or browse the library
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* Completed Tasks Section */}
              {quest.quest_tasks.filter(task => task.is_completed).length > 0 && (
                <div className="mb-8">
                  <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>
                    Completed Tasks
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {quest.quest_tasks
                      .filter(task => task.is_completed)
                      .map((task) => {
                      const pillarData = getPillarData(task.pillar);

                      return (
                        <div
                          key={task.id}
                          className="relative rounded-xl overflow-hidden transition-all hover:shadow-lg border-2 border-gray-100 hover:border-gray-200"
                          style={{
                            background: `linear-gradient(135deg, ${pillarData.color}15 0%, ${pillarData.color}05 100%)`
                          }}
                        >
                          {/* Card Content */}
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
                            className="p-4 cursor-pointer"
                          >
                            {/* Completed Badge (top right) */}
                            <div className="absolute top-3 right-3">
                              <div className="px-3 py-1 bg-green-500 text-white rounded-full text-xs font-bold" style={{ fontFamily: 'Poppins' }}>
                                COMPLETED
                              </div>
                            </div>

                            {/* Task Title */}
                            <h3
                              className="text-lg font-bold text-gray-900 mb-2 leading-tight pr-24"
                              style={{ fontFamily: 'Poppins' }}
                            >
                              {task.title}
                            </h3>

                            {/* Task Description */}
                            {task.description && (
                              <p className="text-sm text-gray-700 mb-3 line-clamp-2" style={{ fontFamily: 'Poppins' }}>
                                {task.description}
                              </p>
                            )}

                            {/* Pillar Badge + XP Badge Row */}
                            <div className="flex items-center gap-2 mb-3">
                              <div
                                className="inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-semibold text-white"
                                style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                              >
                                {pillarData.name}
                              </div>
                              <div
                                className="px-3 py-1 rounded-full text-sm font-bold"
                                style={{
                                  backgroundColor: `${pillarData.color}20`,
                                  color: pillarData.color
                                }}
                              >
                                {task.xp_amount} XP
                              </div>
                            </div>
                            {/* Action Buttons */}
                            <div className="px-4 pb-4">
                              {/* Edit Evidence Button for Completed Tasks (hide for tutorial tasks) */}
                              {!task.auto_complete && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTask(task);
                                    setShowTaskModal(true);
                                  }}
                                  className="w-full py-2.5 bg-white text-gray-800 border-2 border-gray-300 rounded-full font-bold text-sm uppercase tracking-wide transition-all hover:border-gray-400"
                                  style={{ fontFamily: 'Poppins' }}
                                >
                                  Edit Evidence
                                </button>
                              )}

                              {/* Completed badge for auto-verified tasks */}
                              {task.auto_complete && (
                                <div
                                  className="w-full py-2.5 bg-green-100 text-green-700 border-2 border-green-300 rounded-full font-bold text-sm uppercase tracking-wide text-center"
                                  style={{ fontFamily: 'Poppins' }}
                                >
                                  ✅ Completed!
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </>
          ) : null}

          {/* Enrollment flow for users without tasks */}
          {quest.quest_tasks && quest.quest_tasks.length === 0 && quest.user_enrollment && !showPersonalizationWizard ? (
            <div className="text-center py-12 bg-white rounded-xl shadow-md">
              <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg text-gray-600 mb-2" style={{ fontFamily: 'Poppins' }}>
                Ready to personalize this quest?
              </p>
              <p className="text-sm text-gray-500 mb-6" style={{ fontFamily: 'Poppins' }}>
                Create custom tasks, write your own, or browse the task library
              </p>
              <button
                onClick={() => setShowPersonalizationWizard(true)}
                className="px-6 py-3 bg-gradient-primary text-white rounded-lg font-semibold hover:opacity-90"
                style={{ fontFamily: 'Poppins' }}
              >
                Start Personalizing
              </button>
            </div>
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
        <>
          {/* Show tutorial instructions modal for tutorial tasks */}
          {selectedTask.auto_complete && !selectedTask.is_completed ? (
            <TutorialTaskInstructionsModal
              task={selectedTask}
              onClose={() => setShowTaskModal(false)}
            />
          ) : (
            /* Show regular evidence modal for non-tutorial tasks */
            <TaskEvidenceModal
              task={selectedTask}
              questId={quest.id}
              onComplete={handleTaskCompletion}
              onClose={() => setShowTaskModal(false)}
            />
          )}
        </>
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