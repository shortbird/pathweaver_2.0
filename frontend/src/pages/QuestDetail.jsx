import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useQuestDetail, useEnrollQuest, useCompleteTask, useEndQuest } from '../hooks/api/useQuests';
import { handleApiResponse } from '../utils/errorHandling';
import { getPillarData } from '../utils/pillarMappings';
import { hasFeatureAccess } from '../utils/tierMapping';
import { queryKeys } from '../utils/queryKeys';
import TaskEvidenceModal from '../components/quest/TaskEvidenceModal';
import TaskDetailModal from '../components/quest/TaskDetailModal';
import QuestPersonalizationWizard from '../components/quests/QuestPersonalizationWizard';
import { getQuestHeaderImageSync } from '../utils/questSourceConfig';
import { MapPin, Calendar, ExternalLink, Clock, Award, Users, CheckCircle, Circle, Target, BookOpen, Lock, UserPlus } from 'lucide-react';
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

  // Check if user can start quests (requires paid tier)
  const canStartQuests = hasFeatureAccess(user?.subscription_tier, 'supported');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [taskDetailToShow, setTaskDetailToShow] = useState(null);
  const [showPersonalizationWizard, setShowPersonalizationWizard] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState(new Set());

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
            className="px-4 py-2 bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white rounded-lg hover:shadow-lg transition-all mr-4"
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


        // Show personalization wizard after successful enrollment
        setTimeout(() => {
          setShowPersonalizationWizard(true);
        }, 100);
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
    if (!quest?.quest_tasks) return { baseXP: 0, bonusXP: 0, totalXP: 0, earnedXP: 0, earnedBonusXP: 0 };

    const tasks = quest.quest_tasks;
    const baseXP = tasks.reduce((sum, task) => sum + (task.xp_amount || 0), 0);
    const earnedXP = tasks
      .filter(task => task.is_completed)
      .reduce((sum, task) => sum + (task.xp_amount || 0), 0);

    // Completion bonus removed in Phase 2 refactoring (January 2025)
    const bonusXP = 0;
    const totalXP = baseXP;
    const earnedBonusXP = 0;

    return { baseXP, bonusXP, totalXP, earnedXP, earnedBonusXP };
  };

  const getPillarBreakdown = () => {
    if (!quest?.quest_tasks) return {};
    
    const breakdown = {};
    quest.quest_tasks.forEach(task => {
      const pillar = task.pillar || 'life_wellness';
      if (!breakdown[pillar]) {
        breakdown[pillar] = 0;
      }
      breakdown[pillar] += task.xp_amount || 0;
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
            className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-6 py-3 rounded-[30px] hover:shadow-lg transition-all"
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
  const { baseXP, bonusXP, totalXP, earnedXP, earnedBonusXP } = calculateXP();
  const pillarBreakdown = getPillarBreakdown();
  const locationDisplay = getLocationDisplay();
  const seasonalDisplay = getSeasonalDisplay();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Quest Title and Information Section */}
      <div className="bg-white rounded-xl shadow-md p-6 mb-6">
        <h1 className="text-4xl font-bold mb-4 text-gray-900">{quest.title}</h1>
        <p className="text-lg text-gray-700 mb-6">{quest.big_idea || quest.description}</p>
        
        {/* Stats Cards */}
        <div className="flex flex-wrap gap-3">
          <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-4 py-2 rounded-lg text-center">
            <div className="font-bold text-lg">{totalXP}</div>
            <div className="text-white/90 text-xs">Total XP</div>
          </div>
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg text-center">
            <div className="font-bold text-lg">{completedTasks} / {totalTasks}</div>
            <div className="text-white/90 text-xs">Tasks</div>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-4 py-2 rounded-lg text-center">
            <div className="font-bold text-lg">+{bonusXP}</div>
            <div className="text-white/90 text-xs">Completion Bonus</div>
          </div>
        </div>
      </div>

      {/* Team-up invitation banner removed in Phase 3 refactoring (January 2025) */}

      {/* Quest Metadata Strip */}
      <div className="bg-white rounded-xl shadow-md p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center text-sm">
          {locationDisplay && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4" />
              <span>{locationDisplay}</span>
            </div>
          )}
          
          {seasonalDisplay && (
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="w-4 h-4" />
              <span>{seasonalDisplay}</span>
            </div>
          )}
        </div>
        
        {/* Pillar XP Breakdown */}
        {Object.keys(pillarBreakdown).length > 0 && (
          <div className="mt-4">
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
          </div>
        )}
      </div>


      {/* Progress Dashboard - Moved to top */}
      {(quest.user_enrollment || isQuestCompleted) && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Your Progress</h2>
            <div className="flex items-center gap-4">
              <div className="text-2xl font-bold text-gray-900">{Math.round(progressPercentage)}%</div>
            </div>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-4 mb-4 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full transition-all duration-1000 ease-out relative"
              style={{ width: `${progressPercentage}%` }}
            >
              <div className="absolute inset-0 bg-white opacity-20 animate-pulse"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
              {earnedXP + earnedBonusXP} / {totalXP} XP
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">{completedTasks}</div>
              <div className="text-sm text-gray-600">Completed</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{totalTasks - completedTasks}</div>
              <div className="text-sm text-gray-600">Remaining</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">{earnedXP}</div>
              <div className="text-sm text-gray-600">XP Earned</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">{earnedBonusXP}</div>
              <div className="text-sm text-gray-600">Bonus XP</div>
            </div>
          </div>
        </div>
      )}

      {/* Collaboration status removed in Phase 3 refactoring (January 2025) */}

      {/* 4. Call-to-Action Buttons */}
      {(isQuestCompleted || !quest.user_enrollment || (quest.user_enrollment && totalTasks === 0)) && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex gap-4">
            {isQuestCompleted ? (
              <button
                onClick={() => navigate('/diploma')}
                className="flex-1 bg-emerald-500 text-white py-4 px-8 rounded-[30px] hover:bg-emerald-600 hover:-translate-y-1 transition-all duration-300 font-bold text-lg shadow-lg"
              >
                <Award className="w-5 h-5 inline mr-2" />
                Complete! View on Diploma
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
                    className="flex-1 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white py-4 px-8 rounded-[30px] hover:shadow-[0_8px_30px_rgba(239,89,123,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Target className="w-5 h-5 inline mr-2" />
                    {isEnrolling ? 'Enrolling...' : 'Start Quest'}
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

      {/* 5. Enhanced Tasks Interface */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden mb-8">
        <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Quest Tasks</h2>
              <p className="text-white/80 mt-2">Complete tasks to earn XP and progress</p>
            </div>
            {isRefreshing && (
              <div className="flex items-center gap-2 text-white/90">
                <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></div>
                <span className="text-sm">Updating...</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-6">
          {quest.quest_tasks && quest.quest_tasks.length > 0 ? (
            <div className="space-y-4">
              {quest.quest_tasks.map((task, index) => {
                const pillarData = getPillarData(task.pillar);
                const isExpanded = expandedTasks.has(task.id);
                
                return (
                  <div 
                    key={task.id}
                    className={`border-2 rounded-xl transition-all duration-300 ${
                      task.is_completed 
                        ? 'bg-green-50 border-green-300 shadow-green-100' 
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
                    }`}
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center mb-3">
                            {task.is_completed ? (
                              <CheckCircle className="w-6 h-6 text-green-600 mr-3" />
                            ) : (
                              <Circle className="w-6 h-6 text-gray-400 mr-3" />
                            )}
                            <h3 className="text-lg font-bold text-gray-900">{task.title}</h3>
                          </div>
                          
                          <div className="flex flex-col gap-2 mb-3">
                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${pillarData.bg} ${pillarData.text} self-start`}>
                              {pillarData.icon} {pillarData.name}
                            </div>
                            <div className="font-bold text-base text-gray-900">
                              {task.xp_amount} XP
                            </div>
                          </div>

                          {/* School Subjects Display */}
                          {task.school_subjects && task.school_subjects.length > 0 && (
                            <div className="mb-3">
                              <div className="flex items-center gap-1 mb-2">
                                <span className="text-sm text-gray-500 font-medium">Diploma Credit:</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {task.school_subjects.map(subject => {
                                  const subjectNames = {
                                    'language_arts': 'Language Arts',
                                    'math': 'Math',
                                    'science': 'Science',
                                    'social_studies': 'Social Studies',
                                    'financial_literacy': 'Financial Literacy',
                                    'health': 'Health',
                                    'pe': 'PE',
                                    'fine_arts': 'Fine Arts',
                                    'cte': 'CTE',
                                    'digital_literacy': 'Digital Literacy',
                                    'electives': 'Electives'
                                  };
                                  
                                  return (
                                    <div
                                      key={subject}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100"
                                    >
                                      <span>{subjectNames[subject] || subject}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* View Details Button */}
                          <button
                            onClick={() => {
                              setTaskDetailToShow(task);
                              setShowTaskDetailModal(true);
                            }}
                            className="text-[#ef597b] hover:text-[#6d469b] font-medium text-sm mb-3 flex items-center gap-1 transition-colors"
                          >
                            <BookOpen className="w-4 h-4" />
                            View Task Details
                          </button>
                        </div>

                        {/* Action buttons */}
                        <div className="mt-4">
                          {quest.user_enrollment && !task.is_completed && !isQuestCompleted && (
                            <button
                              onClick={() => {
                                setSelectedTask(task);
                                setShowTaskModal(true);
                              }}
                              className="w-full px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-[20px] hover:shadow-[0_4px_15px_rgba(239,89,123,0.3)] hover:-translate-y-0.5 transition-all duration-300 font-medium text-sm"
                            >
                              Update Progress
                            </button>
                          )}

                          {task.is_completed && (
                            <div className="flex flex-col gap-2">
                              <div className="w-full px-4 py-2 bg-green-100 text-green-800 rounded-[20px] font-medium text-sm text-center">
                                Completed
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedTask(task);
                                  setShowTaskModal(true);
                                }}
                                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-[20px] hover:bg-gray-200 transition-all duration-300 font-medium text-sm border border-gray-300"
                              >
                                Edit Evidence
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Add More Tasks Button - only show if enrolled and has tasks */}
              {quest.user_enrollment && !isQuestCompleted && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => setShowPersonalizationWizard(true)}
                    className="px-6 py-3 bg-gradient-to-r from-[#6d469b] to-[#8b5cf6] text-white rounded-[25px] hover:shadow-[0_6px_20px_rgba(109,70,155,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold flex items-center gap-2"
                  >
                    <Target className="w-5 h-5" />
                    Add More Tasks
                  </button>
                </div>
              )}
            </div>
          ) : quest.user_enrollment && !showPersonalizationWizard ? (
            <div className="text-center py-12">
              <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg text-gray-600 mb-4">This quest needs to be personalized</p>
              <button
                onClick={() => setShowPersonalizationWizard(true)}
                className="px-6 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg font-semibold hover:opacity-90"
              >
                Personalize Quest
              </button>
            </div>
          ) : !quest.user_enrollment ? (
            <div className="text-center py-12 text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Start this quest to see tasks</p>
            </div>
          ) : null}
        </div>
      </div>


      {/* Quest Management - Finish Quest */}
      {quest.user_enrollment && !isQuestCompleted && (
        <div className="bg-white rounded-xl shadow-md p-6 text-center">
          <button
            onClick={handleEndQuest}
            disabled={endQuestMutation.isPending}
            className="px-6 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-[25px] hover:shadow-[0_6px_20px_rgba(239,89,123,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {endQuestMutation.isPending ? 'Finishing...' : 'Finish Quest'}
          </button>
        </div>
      )}

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