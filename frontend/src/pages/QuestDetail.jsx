import React, { lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuestDetailData } from '../hooks/useQuestDetailData';
import { queryKeys } from '../utils/queryKeys';
import api from '../services/api';
import QuestDetailHeader from '../components/quest/QuestDetailHeader';
import QuestEnrollment from '../components/quest/QuestEnrollment';
import toast from 'react-hot-toast';
import logger from '../utils/logger';

// Lazy load heavy components
const TaskEvidenceModal = lazy(() => import('../components/quest/TaskEvidenceModal'));
const TaskDetailModal = lazy(() => import('../components/quest/TaskDetailModal'));
const QuestPersonalizationWizard = lazy(() => import('../components/quests/QuestPersonalizationWizard'));
const QuestCompletionCelebration = lazy(() => import('../components/quest/QuestCompletionCelebration'));
const TaskTimeline = lazy(() => import('../components/quest/TaskTimeline'));
const TaskWorkspace = lazy(() => import('../components/quest/TaskWorkspace'));
const RestartQuestModal = lazy(() => import('../components/quest/RestartQuestModal'));

// Loading spinner
const LoadingFallback = () => (
  <div className="flex justify-center items-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
  </div>
);

const QuestDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Use custom hook for all data management
  const {
    quest,
    isLoading,
    error,
    refetchQuest,
    enrollMutation,
    endQuestMutation,
    isEnrolling,
    selectedTask,
    setSelectedTask,
    showPersonalizationWizard,
    setShowPersonalizationWizard,
    showQuestCompletionCelebration,
    setShowQuestCompletionCelebration,
    displayMode,
    setDisplayMode,
    showRestartModal,
    setShowRestartModal,
    restartModalData,
    setRestartModalData,
    xpData,
    pillarBreakdown,
    completedTasks,
    totalTasks,
    progressPercentage,
    isQuestCompleted,
    queryClient
  } = useQuestDetailData(id);

  // Local state for modals and UI
  const [showTaskModal, setShowTaskModal] = React.useState(false);
  const [showTaskDetailModal, setShowTaskDetailModal] = React.useState(false);
  const [taskDetailToShow, setTaskDetailToShow] = React.useState(null);
  const [droppingTaskId, setDroppingTaskId] = React.useState(null);
  const [showMobileDrawer, setShowMobileDrawer] = React.useState(false);

  const { earnedXP } = xpData;

  // Handle enrollment
  const handleEnroll = async (options = {}) => {
    if (!user) {
      navigate('/login');
      return;
    }

    enrollMutation.mutate({ questId: id, options }, {
      onSuccess: async (data) => {
        queryClient.invalidateQueries(queryKeys.quests.detail(id));
        await refetchQuest();

        const skipWizard = data?.enrollment?.skip_wizard || data?.skip_wizard || data?.tasks_loaded || false;

        if (skipWizard) {
          if (data?.tasks_loaded) {
            toast.success(`Restarted quest with ${data.tasks_loaded} previous tasks!`);
          } else {
            toast.success('Enrolled! Your tasks are ready.');
          }
        } else {
          setTimeout(() => {
            setShowPersonalizationWizard(true);
          }, 100);
        }
      },
      onError: (error) => {
        if (error.response?.status === 409 && error.response?.data?.requires_confirmation) {
          const previousTaskCount = error.response.data.previous_task_count || 0;
          setRestartModalData({
            previousTaskCount: previousTaskCount,
            questTitle: quest?.title || 'this quest'
          });
          setShowRestartModal(true);
        } else {
          console.error('Enrollment failed:', error);
        }
      }
    });
  };

  const handlePersonalizationComplete = async () => {
    setShowPersonalizationWizard(false);
    queryClient.invalidateQueries(queryKeys.quests.detail(id));
    await refetchQuest();
    toast.success('Quest personalized successfully!');
  };

  const handlePersonalizationCancel = () => {
    setShowPersonalizationWizard(false);
  };

  const handleLoadPreviousTasks = () => {
    setShowRestartModal(false);
    handleEnroll({ load_previous_tasks: true, force_new: true });
  };

  const handleStartFresh = () => {
    setShowRestartModal(false);
    handleEnroll({ force_new: true });
  };

  const handleDropTask = async (taskId) => {
    if (!window.confirm('Remove this task from your active quest? You can add it back later from the task library.')) {
      return;
    }

    setDroppingTaskId(taskId);

    try {
      await api.delete(`/api/tasks/${taskId}`);
      queryClient.invalidateQueries(queryKeys.quests.detail(id));
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
    if (!quest?.user_enrollment) return;

    endQuestMutation.mutate(id, {
      onSuccess: () => {
        toast.success('Quest completed! Returning to dashboard...');
        navigate('/');
      },
      onError: (error) => {
        console.error('Error ending quest:', error);
        toast.error('Failed to finish quest. Please try again.');
      }
    });
  };

  const handleAddMoreTasks = () => {
    setShowQuestCompletionCelebration(false);
    setShowPersonalizationWizard(true);
  };

  const handleFinishQuestFromCelebration = () => {
    setShowQuestCompletionCelebration(false);
    handleEndQuest();
  };

  const handleTaskCompletion = async (completionData) => {
    logger.debug('[QUEST_DETAIL] ========== TASK COMPLETION HANDLER START ==========');
    logger.debug('[QUEST_DETAIL] completionData:', completionData);

    if (selectedTask) {
      logger.debug('[QUEST_DETAIL] About to call flushSync for state + cache update');

      flushSync(() => {
        logger.debug('[QUEST_DETAIL] Inside flushSync - updating selectedTask state');
        setSelectedTask(prev => {
          const updated = prev ? { ...prev, is_completed: true } : null;
          logger.debug('[QUEST_DETAIL] selectedTask state updated to:', {
            id: updated?.id?.substring(0, 8),
            is_completed: updated?.is_completed
          });
          return updated;
        });

        logger.debug('[QUEST_DETAIL] Inside flushSync - updating React Query cache');
        queryClient.setQueryData(queryKeys.quests.detail(id), (oldData) => {
          if (!oldData) {
            logger.debug('[QUEST_DETAIL] No oldData in cache, returning null');
            return oldData;
          }

          logger.debug('[QUEST_DETAIL] Old cache data quest_tasks count:', oldData.quest_tasks?.length);
          logger.debug('[QUEST_DETAIL] Updating task in cache:', selectedTask.id.substring(0, 8));

          const updatedTasks = oldData.quest_tasks?.map(task => {
            if (task.id === selectedTask.id) {
              logger.debug('[QUEST_DETAIL] Found matching task, marking is_completed=true');
              return { ...task, is_completed: true };
            }
            return task;
          }) || [];

          const completedCount = updatedTasks.filter(task => task.is_completed).length;
          const totalCount = updatedTasks.length;
          const newProgressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
          const isNewlyCompleted = newProgressPercentage === 100 && !oldData.completed_enrollment;

          logger.debug('[QUEST_DETAIL] Cache update complete:', {
            completedCount,
            totalCount,
            progressPercentage: newProgressPercentage,
            isNewlyCompleted
          });

          if (isNewlyCompleted) {
            logger.debug('[QUEST_DETAIL] Quest newly completed - showing celebration');
            setTimeout(() => {
              setShowQuestCompletionCelebration(true);
            }, 500);
          }

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
      });

      logger.debug('[QUEST_DETAIL] flushSync completed - all updates should be synchronous');
    }

    logger.debug('[QUEST_DETAIL] Closing modal and clearing selectedTask');
    setShowTaskModal(false);
    setSelectedTask(null);

    logger.debug('[QUEST_DETAIL] ========== TASK COMPLETION HANDLER END ==========');
  };

  const handleTaskReorder = async (oldIndex, newIndex) => {
    if (!quest?.quest_tasks) return;

    const reorderedTasks = Array.from(quest.quest_tasks);
    const [movedTask] = reorderedTasks.splice(oldIndex, 1);
    reorderedTasks.splice(newIndex, 0, movedTask);

    const updatedTasks = reorderedTasks.map((task, index) => ({
      ...task,
      order_index: index
    }));

    queryClient.setQueryData(queryKeys.quests.detail(id), (oldData) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        quest_tasks: updatedTasks
      };
    });

    try {
      await api.put(`/api/quests/${id}/tasks/reorder`, {
        task_ids: updatedTasks.map(t => t.id)
      });
    } catch (err) {
      console.error('Error reordering tasks:', err);
      toast.error('Failed to save task order');
      refetchQuest();
    }
  };

  const handleDisplayModeChange = async (newMode) => {
    setDisplayMode(newMode);

    try {
      await api.put(`/api/quests/${id}/display-mode`, {
        display_mode: newMode
      });
    } catch (err) {
      console.error('Error updating display mode:', err);
    }
  };

  const handleTaskSelect = (task) => {
    setSelectedTask(task);
    if (window.innerWidth < 768) {
      setShowMobileDrawer(false);
    }
  };

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

  if (!quest) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">Quest not found</div>
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

  return (
    <div className="min-h-screen bg-gray-50 pt-[50px] sm:pt-0">
      {/* Hero Section */}
      <QuestDetailHeader
        quest={quest}
        completedTasks={completedTasks}
        totalTasks={totalTasks}
        progressPercentage={progressPercentage}
        earnedXP={earnedXP}
        pillarBreakdown={pillarBreakdown}
        isQuestCompleted={isQuestCompleted}
        onEndQuest={handleEndQuest}
        endQuestMutation={endQuestMutation}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Enrollment and Sample/Preset Tasks */}
        <QuestEnrollment
          quest={quest}
          isQuestCompleted={isQuestCompleted}
          totalTasks={totalTasks}
          isEnrolling={isEnrolling}
          onEnroll={handleEnroll}
          onShowPersonalizationWizard={() => setShowPersonalizationWizard(true)}
        />

        {/* Task Display - Two Column Layout */}
        {quest.user_enrollment && quest.quest_tasks && quest.quest_tasks.length > 0 && (
          <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-400px)] min-h-[600px]">
            {/* Mobile: Hamburger Menu Button */}
            <button
              onClick={() => setShowMobileDrawer(true)}
              className="md:hidden fixed bottom-6 left-6 z-40 w-14 h-14 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Task Timeline (22%) */}
            <div className="w-full md:w-[22%] bg-white rounded-xl shadow-md overflow-hidden hidden md:block">
              <Suspense fallback={<LoadingFallback />}>
                <TaskTimeline
                  tasks={quest.quest_tasks}
                  selectedTaskId={selectedTask?.id}
                  onTaskSelect={handleTaskSelect}
                  onTaskReorder={handleTaskReorder}
                  onAddTask={() => setShowPersonalizationWizard(true)}
                  onRemoveTask={handleDropTask}
                  displayMode={displayMode}
                  onDisplayModeChange={handleDisplayModeChange}
                />
              </Suspense>
            </div>

            {/* Task Workspace (78%) */}
            <div className="flex-1 bg-white rounded-xl shadow-md overflow-hidden">
              <Suspense fallback={<LoadingFallback />}>
                <TaskWorkspace
                  task={selectedTask}
                  questId={quest.id}
                  onTaskComplete={handleTaskCompletion}
                  onClose={() => setSelectedTask(null)}
                />
              </Suspense>
            </div>

            {/* Mobile Drawer */}
            {showMobileDrawer && (
              <div className="fixed inset-0 z-50 md:hidden">
                <div
                  className="absolute inset-0 bg-black bg-opacity-50"
                  onClick={() => setShowMobileDrawer(false)}
                  role="button"
                  tabIndex="0"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowMobileDrawer(false);
                    }
                  }}
                  aria-label="Close mobile drawer"
                />
                <div className="absolute left-0 top-0 bottom-0 w-80 bg-white shadow-xl">
                  <Suspense fallback={<LoadingFallback />}>
                    <TaskTimeline
                      tasks={quest.quest_tasks}
                      selectedTaskId={selectedTask?.id}
                      onTaskSelect={handleTaskSelect}
                      onTaskReorder={handleTaskReorder}
                      onAddTask={() => setShowPersonalizationWizard(true)}
                      displayMode={displayMode}
                      onDisplayModeChange={handleDisplayModeChange}
                    />
                  </Suspense>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showTaskModal && selectedTask && (
        <Suspense fallback={<LoadingFallback />}>
          <TaskEvidenceModal
            task={selectedTask}
            questId={quest.id}
            onComplete={handleTaskCompletion}
            onClose={() => setShowTaskModal(false)}
          />
        </Suspense>
      )}

      {showTaskDetailModal && (
        <Suspense fallback={<LoadingFallback />}>
          <TaskDetailModal
            task={taskDetailToShow}
            isOpen={showTaskDetailModal}
            onClose={() => {
              setShowTaskDetailModal(false);
              setTaskDetailToShow(null);
            }}
          />
        </Suspense>
      )}

      {showPersonalizationWizard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <Suspense fallback={<LoadingFallback />}>
              <QuestPersonalizationWizard
                questId={quest.id}
                questTitle={quest.title}
                onComplete={handlePersonalizationComplete}
                onCancel={handlePersonalizationCancel}
              />
            </Suspense>
          </div>
        </div>
      )}

      {showQuestCompletionCelebration && quest && (
        <Suspense fallback={<LoadingFallback />}>
          <QuestCompletionCelebration
            quest={quest}
            completedTasksCount={quest.progress?.completed_tasks || 0}
            totalXP={
              quest.quest_tasks
                ?.filter(task => task.is_completed)
                .reduce((sum, task) => sum + (task.xp_value || 0), 0) || 0
            }
            onAddMoreTasks={handleAddMoreTasks}
            onFinishQuest={handleFinishQuestFromCelebration}
            onClose={() => setShowQuestCompletionCelebration(false)}
          />
        </Suspense>
      )}

      <Suspense fallback={<LoadingFallback />}>
        <RestartQuestModal
          isOpen={showRestartModal}
          questTitle={restartModalData.questTitle}
          previousTaskCount={restartModalData.previousTaskCount}
          onLoadPreviousTasks={handleLoadPreviousTasks}
          onStartFresh={handleStartFresh}
          onClose={() => setShowRestartModal(false)}
        />
      </Suspense>
    </div>
  );
};

export default QuestDetail;
