import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { handleApiResponse } from '../utils/errorHandling';
import TaskCompletionModal from '../components/quest/TaskCompletionModal';
import LearningLogSection from '../components/quest/LearningLogSection';
import TeamUpModal from '../components/quest/TeamUpModal';
import { getQuestHeaderImage } from '../utils/questSourceConfig';

const QuestDetailV3 = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [quest, setQuest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTeamUpModal, setShowTeamUpModal] = useState(false);

  useEffect(() => {
    fetchQuestDetails();
  }, [id]);

  const fetchQuestDetails = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${apiBase}/v3/quests/${id}`, {
        headers: user ? {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        } : {}
      });

      if (!response.ok) {
        throw new Error('Failed to fetch quest details');
      }

      const data = await response.json();
      setQuest(data.quest);
    } catch (error) {
      console.error('Error fetching quest:', error);
      setError('Failed to load quest details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${apiBase}/v3/quests/${id}/enroll`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      handleApiResponse(response, data, 'Failed to enroll');

      // Refresh quest details to show enrollment
      await fetchQuestDetails();
      alert(data.message);
    } catch (error) {
      console.error('Error enrolling:', error);
      alert(error.message || 'Failed to enroll in quest');
    }
  };

  const handleTaskComplete = async (result) => {
    // Close modal
    setShowTaskModal(false);
    setSelectedTask(null);

    // Show success message
    alert(result.message);

    // Dispatch event for dashboard to refresh
    window.dispatchEvent(new CustomEvent('taskCompleted', { 
      detail: { 
        taskId: result.task?.id,
        xp_awarded: result.xp_awarded 
      } 
    }));

    // Refresh quest details to update progress
    await fetchQuestDetails();

    // If quest completed, show special message
    if (result.quest_completed) {
      // Dispatch quest completion event
      window.dispatchEvent(new CustomEvent('questCompleted', { 
        detail: { 
          questId: id 
        } 
      }));
      
      setTimeout(() => {
        alert('🎉 Congratulations! You\'ve completed the entire quest!');
      }, 1000);
    }
  };

  const handleTeamUpInviteSent = (result) => {
    setShowTeamUpModal(false);
    alert(result.message);
  };

  const handleCancelQuest = async () => {
    if (!confirm('Are you sure you want to cancel this quest?\n\nWarning: All your progress and any work submitted to Optio for this quest will be permanently deleted.')) {
      return;
    }

    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${apiBase}/v3/quests/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      handleApiResponse(response, data, 'Failed to cancel quest');

      alert('Quest cancelled successfully');
      navigate('/quests');
    } catch (error) {
      console.error('Error cancelling quest:', error);
      alert(error.message || 'Failed to cancel quest');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !quest) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{error || 'Quest not found'}</p>
          <button
            onClick={() => navigate('/quests')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Quest Hub
          </button>
        </div>
      </div>
    );
  }

  const totalXP = quest.quest_tasks?.reduce((sum, task) => sum + task.xp_amount, 0) || 0;
  const completedTasks = quest.quest_tasks?.filter(task => task.is_completed).length || 0;
  const totalTasks = quest.quest_tasks?.length || 0;
  const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Quest Header */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
          {quest.header_image_url || quest.source ? (
            <img 
              src={quest.header_image_url || getQuestHeaderImage(quest)} 
              alt={quest.title}
              className="w-full h-64 object-cover"
              onError={(e) => {
                // Fallback to default gradient if image fails to load
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
          ) : null}
          <div 
            className="h-64 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center"
            style={{ display: quest.header_image_url || quest.source ? 'none' : 'flex' }}
          >
            <div className="text-white text-center">
              <div className="text-6xl mb-2">🚀</div>
              <div className="text-xl font-medium">Quest</div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">{quest.title}</h1>
                <p className="text-gray-600 text-lg">{quest.big_idea}</p>
              </div>
              <div className="text-right ml-4">
                <div className="text-3xl font-bold text-green-600">{totalXP} XP</div>
                <div className="text-sm text-gray-500">Total Available</div>
              </div>
            </div>

            {/* Progress Bar */}
            {quest.user_enrollment && (
              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Progress: {completedTasks} / {totalTasks} tasks</span>
                  <span>{Math.round(progressPercentage)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Collaboration Status */}
            {quest.collaboration && (
              <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-purple-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                  </svg>
                  <span className="text-purple-700">
                    {quest.collaboration.status === 'accepted' 
                      ? '🎉 You\'re teamed up! All tasks earn 2x XP'
                      : '⏳ Team-up invitation pending'}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {!quest.user_enrollment ? (
                <>
                  <button
                    onClick={handleEnroll}
                    className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Start Quest
                  </button>
                  <button
                    onClick={() => setShowTeamUpModal(true)}
                    className="bg-purple-600 text-white py-3 px-6 rounded-lg hover:bg-purple-700 transition-colors font-medium"
                  >
                    Team Up First
                  </button>
                </>
              ) : progressPercentage === 100 ? (
                <button
                  onClick={() => navigate('/diploma')}
                  className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  View Achievement 🏆
                </button>
              ) : (
                <div className="flex gap-3 flex-1">
                  {!quest.collaboration && (
                    <button
                      onClick={() => setShowTeamUpModal(true)}
                      className="bg-purple-600 text-white py-3 px-6 rounded-lg hover:bg-purple-700 transition-colors font-medium"
                    >
                      Team Up
                    </button>
                  )}
                  <button
                    onClick={handleCancelQuest}
                    className="ml-auto bg-red-600 text-white py-3 px-6 rounded-lg hover:bg-red-700 transition-colors font-medium"
                  >
                    Cancel Quest
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tasks Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">
            Tasks
          </h2>

          {quest.quest_tasks && quest.quest_tasks.length > 0 ? (
            <div className="space-y-4">
              {quest.quest_tasks.map((task, index) => (
                <div 
                  key={task.id}
                  className={`border rounded-lg p-4 transition-all ${
                    task.is_completed 
                      ? 'bg-green-50 border-green-300' 
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <h3 className="text-lg font-medium text-gray-800">{task.title}</h3>
                        {task.is_completed && (
                          <svg className="w-5 h-5 text-green-600 ml-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-gray-600 text-sm mb-3">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium text-white bg-gradient-to-r
                          ${task.pillar === 'creativity' ? 'from-purple-500 to-pink-500' : ''}
                          ${task.pillar === 'critical_thinking' ? 'from-blue-500 to-cyan-500' : ''}
                          ${task.pillar === 'practical_skills' ? 'from-green-500 to-emerald-500' : ''}
                          ${task.pillar === 'communication' ? 'from-orange-500 to-yellow-500' : ''}
                          ${task.pillar === 'cultural_literacy' ? 'from-red-500 to-rose-500' : ''}
                        `}>
                          {task.pillar.replace('_', ' ')}
                        </span>
                        <span className="text-sm font-medium text-gray-700">
                          {task.xp_amount} XP
                        </span>
                        {task.is_collaboration_eligible && quest.collaboration?.status === 'accepted' && (
                          <span className="text-sm font-medium text-purple-600">
                            (×2 = {task.xp_amount * 2} XP)
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {quest.user_enrollment && !task.is_completed && (
                      <button
                        onClick={() => {
                          setSelectedTask(task);
                          setShowTaskModal(true);
                        }}
                        className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Complete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No tasks available for this quest.</p>
          )}
        </div>

        {/* Learning Log Section */}
        {quest.user_enrollment && (
          <LearningLogSection 
            userQuestId={quest.user_enrollment.id}
            isOwner={true}
          />
        )}

      {/* Task Completion Modal */}
      {showTaskModal && selectedTask && (
        <TaskCompletionModal
          task={selectedTask}
          questId={quest.id}
          onComplete={handleTaskComplete}
          onClose={() => {
            setShowTaskModal(false);
            setSelectedTask(null);
          }}
        />
      )}

      {/* Team Up Modal */}
      {showTeamUpModal && (
        <TeamUpModal
          quest={quest}
          onClose={() => setShowTeamUpModal(false)}
          onInviteSent={handleTeamUpInviteSent}
        />
      )}
    </div>
  );
};

export default QuestDetailV3;