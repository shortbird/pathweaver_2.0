import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { handleApiResponse } from '../utils/errorHandling';
import { getPillarData } from '../utils/pillarMappings';
import { hasFeatureAccess } from '../utils/tierMapping';
import TaskEvidenceModal from '../components/quest/TaskEvidenceModal';
import LearningLogSection from '../components/quest/LearningLogSection';
import TeamUpModal from '../components/quest/TeamUpModal';
import { getQuestHeaderImageSync } from '../utils/questSourceConfig';
import { MapPin, Calendar, ExternalLink, Clock, Award, Users, CheckCircle, Circle, Target, BookOpen, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

const QuestDetailV3 = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [quest, setQuest] = useState(null);
  
  // Check if user can start quests (requires paid tier)
  const canStartQuests = hasFeatureAccess(user?.subscription_tier, 'supported');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTeamUpModal, setShowTeamUpModal] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);

  useEffect(() => {
    fetchQuestDetails();
  }, [id, user]); // Also refetch when user login state changes

  const fetchQuestDetails = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('access_token');
      const headers = {};
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${apiBase}/api/v3/quests/${id}?t=${Date.now()}`, {
        headers,
        cache: 'no-cache' // Ensure fresh data is fetched
      });

      if (!response.ok) {
        throw new Error('Failed to fetch quest details');
      }

      const data = await response.json();
      setQuest(data.quest);
      setError(''); // Clear any previous errors
    } catch (error) {
      const errorMsg = error.response?.status === 404
        ? 'This quest could not be found. It may have been removed or is no longer available.'
        : error.response?.status === 403
        ? 'You do not have permission to view this quest.'
        : 'Unable to load quest details. Please refresh the page and try again.'
      setError(errorMsg);
      throw error; // Re-throw so handleTaskCompletion can catch it
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (isEnrolling) return;
    
    setIsEnrolling(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/v3/quests/${id}/enroll`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      handleApiResponse(response, data, 'Failed to enroll');

      if (response.ok) {
        toast.success('Successfully enrolled in quest!');
        // Force refresh immediately to update state
        setIsRefreshing(true);
        await fetchQuestDetails();
        setIsRefreshing(false);
      }
    } catch (error) {
      toast.error('Failed to enroll in quest');
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleEndQuest = async () => {
    if (!quest.user_enrollment) return;

    if (window.confirm('Are you sure you want to finish this quest? This will end your active enrollment and save your progress.')) {
      try {
        const apiBase = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${apiBase}/api/v3/quests/${id}/end`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          toast.success('Quest finished successfully!');
          navigate('/diploma'); // Navigate to diploma to show achievement
        } else {
          throw new Error('Failed to end quest');
        }
      } catch (error) {
        toast.error('Failed to finish quest');
      }
    }
  };

  const handleTaskCompletion = async (completionData) => {
    setShowTaskModal(false);
    setSelectedTask(null);
    
    // Show success message if provided
    if (completionData?.message) {
      toast.success(completionData.message);
    }
    
    // Show refreshing indicator and refresh quest data
    setIsRefreshing(true);
    try {
      // If quest was just completed, wait a moment for database commit
      if (completionData?.quest_completed) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      await fetchQuestDetails();
      
      // If quest is completed, show special celebration after data refresh
      if (completionData?.quest_completed) {
        setTimeout(() => {
          toast.success('Quest Complete! You earned the completion bonus!', {
            duration: 5000,
          });
        }, 500);
      }
    } catch (error) {
      toast.error('Failed to refresh quest data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleInviteSent = async (inviteData) => {
    // Show success message
    if (inviteData?.message) {
      toast.success(inviteData.message);
    }
    
    // Refresh quest details to show any new collaboration status
    try {
      await fetchQuestDetails();
    } catch (error) {
    }
  };

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
    
    const completedCount = tasks.filter(task => task.is_completed).length;
    const totalCount = tasks.length;
    
    const bonusXP = Math.round(baseXP * 0.5 / 50) * 50; // Round to nearest 50
    const totalXP = baseXP + bonusXP;
    const earnedBonusXP = (completedCount === totalCount && totalCount > 0) ? bonusXP : 0;
    
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
  const isQuestCompleted = quest.completed_enrollment && quest.completed_enrollment.completed_at;
  const { baseXP, bonusXP, totalXP, earnedXP, earnedBonusXP } = calculateXP();
  const pillarBreakdown = getPillarBreakdown();
  const locationDisplay = getLocationDisplay();
  const seasonalDisplay = getSeasonalDisplay();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 1. Hero Header Section */}
      <div className="relative overflow-hidden rounded-xl shadow-xl mb-8">
        <img 
          src={quest.header_image_url || getQuestHeaderImageSync(quest)} 
          alt={quest.title}
          className="w-full h-60 object-cover"
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
        <div
          className="w-full h-60 bg-gradient-to-br from-[#ef597b] to-[#6d469b] flex items-center justify-center"
          style={{ display: 'none' }}
        >
          <div className="text-white text-center">
            <Target className="w-16 h-16 mx-auto mb-4" />
            <div className="text-xl font-medium">Quest</div>
          </div>
        </div>
      </div>

      {/* Quest Information Section */}
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

      {/* 2. Quest Metadata Strip */}
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


      {/* 3. Progress Dashboard */}
      {(quest.user_enrollment || isQuestCompleted) && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">Your Progress</h2>
            <div className="flex items-center gap-4">
              <div className="text-2xl font-bold text-gray-900">{Math.round(progressPercentage)}%</div>
              {!isQuestCompleted && (
                canStartQuests ? (
                  <button
                    onClick={() => setShowTeamUpModal(true)}
                    className="bg-purple-600 text-white py-2 px-4 rounded-[20px] hover:bg-purple-700 hover:-translate-y-1 transition-all duration-300 font-medium text-sm shadow-lg"
                  >
                    <Users className="w-4 h-4 inline mr-1" />
                    Team Up
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/subscription')}
                    className="bg-gray-100 text-gray-600 py-2 px-4 rounded-[20px] hover:bg-gray-200 transition-all duration-300 font-medium text-sm border-2 border-gray-300"
                  >
                    <Lock className="w-4 h-4 inline mr-1" />
                    Upgrade to Team Up
                  </button>
                )
              )}
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

      {/* Collaboration Status */}
      {quest.collaboration && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
          <div className="flex items-center">
            <Users className="w-5 h-5 text-purple-600 mr-3" />
            <span className="text-purple-700 font-medium">
              {quest.collaboration.status === 'accepted' 
                ? quest.collaboration.collaborator_names?.length > 0
                  ? `You're teamed up with ${quest.collaboration.collaborator_names.join(' and ')}! All tasks earn double XP`
                  : 'You\'re teamed up! All tasks earn double XP'
                : 'Team-up invitation pending'}
            </span>
          </div>
        </div>
      )}

      {/* 4. Call-to-Action Buttons */}
      {(!quest.user_enrollment || isQuestCompleted) && (
        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <div className="flex gap-4">
            {!quest.user_enrollment ? (
              <>
                {canStartQuests ? (
                  // Paid tier users - show normal start and team up buttons
                  <>
                    <button
                      onClick={handleEnroll}
                      disabled={isEnrolling}
                      className="flex-1 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white py-4 px-8 rounded-[30px] hover:shadow-[0_8px_30px_rgba(239,89,123,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Target className="w-5 h-5 inline mr-2" />
                      {isEnrolling ? 'Enrolling...' : 'Start Quest'}
                    </button>
                    <button
                      onClick={() => setShowTeamUpModal(true)}
                      className="bg-purple-600 text-white py-4 px-8 rounded-[30px] hover:bg-purple-700 hover:-translate-y-1 transition-all duration-300 font-bold text-lg shadow-lg"
                    >
                      <Users className="w-5 h-5 inline mr-2" />
                      Team Up First
                    </button>
                  </>
                ) : (
                  // Free tier users - show upgrade buttons
                  <>
                    <button
                      onClick={() => navigate('/subscription')}
                      className="flex-1 bg-gray-100 text-gray-600 py-4 px-8 rounded-[30px] hover:bg-gray-200 transition-all duration-300 font-bold text-lg border-2 border-gray-300"
                    >
                      <Lock className="w-5 h-5 inline mr-2" />
                      Upgrade to Start
                    </button>
                    <button
                      onClick={() => navigate('/subscription')}
                      className="bg-gray-100 text-gray-600 py-4 px-8 rounded-[30px] hover:bg-gray-200 transition-all duration-300 font-bold text-lg border-2 border-gray-300"
                    >
                      <Lock className="w-5 h-5 inline mr-2" />
                      Upgrade to Team Up
                    </button>
                  </>
                )}
              </>
            ) : isQuestCompleted ? (
              <button
                onClick={() => navigate('/diploma')}
                className="flex-1 bg-emerald-500 text-white py-4 px-8 rounded-[30px] hover:bg-emerald-600 hover:-translate-y-1 transition-all duration-300 font-bold text-lg shadow-lg"
              >
                <Award className="w-5 h-5 inline mr-2" />
                View Achievement on Diploma
              </button>
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
              <p className="text-white/80 mt-2">Complete all tasks to earn the full completion bonus</p>
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
                            <h3 className="text-xl font-bold text-gray-900">{task.title}</h3>
                          </div>
                          
                          <div className="flex items-center gap-4 mb-3">
                            <div className={`px-3 py-1 rounded-full text-sm font-medium ${pillarData.bg} ${pillarData.text}`}>
                              {pillarData.icon} {pillarData.name}
                            </div>
                            <div className="font-bold text-lg text-gray-900">
                              {task.xp_amount} XP
                              {task.is_collaboration_eligible && quest.collaboration?.status === 'accepted' && (
                                <span className="text-purple-600 ml-2">(×2 = {task.xp_amount * 2} XP)</span>
                              )}
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

                          {task.description && (
                            <p className="text-gray-600 mb-3">{task.description}</p>
                          )}

                          {/* Expandable Details */}
                          {(task.evidence_prompt || task.materials_needed?.length > 0) && (
                            <button
                              onClick={() => toggleTaskExpansion(task.id)}
                              className="text-blue-600 hover:text-blue-800 font-medium text-sm mb-3"
                            >
                              {isExpanded ? 'Hide Details' : 'Show Details'} 
                              <span className="ml-1">{isExpanded ? '▼' : '▶'}</span>
                            </button>
                          )}

                          {isExpanded && (
                            <div className="bg-gray-50 rounded-lg p-4 mb-3 space-y-3">
                              {task.evidence_prompt && (
                                <div>
                                  <h4 className="font-medium text-gray-900 mb-1">Evidence Ideas:</h4>
                                  <p className="text-gray-600 text-sm">{task.evidence_prompt}</p>
                                </div>
                              )}
                              
                              {task.materials_needed?.length > 0 && (
                                <div>
                                  <h4 className="font-medium text-gray-900 mb-2">Materials Needed:</h4>
                                  <ul className="space-y-1">
                                    {task.materials_needed.map((material, idx) => (
                                      <li key={idx} className="flex items-center text-sm text-gray-600">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
                                        {material}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {quest.user_enrollment && !task.is_completed && !isQuestCompleted && (
                          <button
                            onClick={() => {
                              setSelectedTask(task);
                              setShowTaskModal(true);
                            }}
                            className="ml-6 px-8 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-[25px] hover:shadow-[0_6px_20px_rgba(239,89,123,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold"
                          >
                            Update Progress
                          </button>
                        )}
                        
                        {task.is_completed && (
                          <div className="ml-6 flex items-center gap-3">
                            <div className="px-8 py-3 bg-green-100 text-green-800 rounded-[25px] font-bold">
                              Completed
                            </div>
                            <button
                              onClick={() => {
                                setSelectedTask(task);
                                setShowTaskModal(true);
                              }}
                              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-[25px] hover:bg-gray-200 transition-all duration-300 font-medium border border-gray-300"
                            >
                              Edit Evidence
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No tasks available for this quest.</p>
            </div>
          )}
        </div>
      </div>

      {/* Learning Log Section */}
      {quest.user_enrollment && (
        <LearningLogSection 
          userQuestId={quest.user_enrollment.id}
          isOwner={true}
        />
      )}

      {/* Quest Management - Finish Quest */}
      {quest.user_enrollment && !isQuestCompleted && (
        <div className="bg-white rounded-xl shadow-md p-6 text-center">
          <button
            onClick={handleEndQuest}
            className="px-6 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-[25px] hover:shadow-[0_6px_20px_rgba(239,89,123,0.3)] hover:-translate-y-1 transition-all duration-300 font-bold"
          >
            Finish Quest
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

      {showTeamUpModal && (
        <TeamUpModal
          quest={quest}
          onClose={() => setShowTeamUpModal(false)}
          onInviteSent={handleInviteSent}
        />
      )}

    </div>
  );
};

export default QuestDetailV3;