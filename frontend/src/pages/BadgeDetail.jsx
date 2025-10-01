import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { CheckCircle, Circle, Lock, ArrowLeft } from 'lucide-react';

export default function BadgeDetail() {
  const { badgeId } = useParams();
  const navigate = useNavigate();
  const [badge, setBadge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    fetchBadgeDetail();
  }, [badgeId]);

  const fetchBadgeDetail = async () => {
    try {
      const response = await api.get(`/api/badges/${badgeId}`);
      setBadge(response.data.badge);
    } catch (error) {
      console.error('Error fetching badge:', error);
      toast.error('Failed to load badge details');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBadge = async () => {
    setSelecting(true);
    try {
      await api.post(`/api/badges/${badgeId}/select`);
      toast.success('Badge selected! Ready to start your first quest?');
      // Refresh badge data to show active status
      await fetchBadgeDetail();
      // Could navigate to first recommended quest
    } catch (error) {
      console.error('Error selecting badge:', error);
      toast.error(error.response?.data?.error || 'Failed to select badge');
    } finally {
      setSelecting(false);
    }
  };

  const handlePauseBadge = async () => {
    try {
      await api.post(`/api/badges/${badgeId}/pause`);
      toast.success('Badge paused. Progress saved!');
      await fetchBadgeDetail();
    } catch (error) {
      console.error('Error pausing badge:', error);
      toast.error('Failed to pause badge');
    }
  };

  const handleQuestClick = (questId) => {
    navigate(`/quests/${questId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading badge...</p>
        </div>
      </div>
    );
  }

  if (!badge) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Badge not found</p>
          <button
            onClick={() => navigate('/badges')}
            className="mt-4 text-purple-600 hover:text-purple-700"
          >
            Back to Badges
          </button>
        </div>
      </div>
    );
  }

  const pillarColors = {
    'STEM & Logic': 'from-blue-400 to-purple-500',
    'Life & Wellness': 'from-green-400 to-teal-500',
    'Language & Communication': 'from-yellow-400 to-orange-500',
    'Society & Culture': 'from-red-400 to-pink-500',
    'Arts & Creativity': 'from-purple-400 to-pink-500'
  };

  const gradientClass = pillarColors[badge.pillar_primary] || 'from-gray-400 to-gray-600';
  const userProgress = badge.user_progress;
  const isActive = userProgress?.is_active && !userProgress?.completed_at;
  const isCompleted = userProgress?.completed_at;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className={`bg-gradient-to-r ${gradientClass} text-white py-16`}>
        <div className="container mx-auto px-4">
          <button
            onClick={() => navigate('/badges')}
            className="flex items-center text-white hover:text-gray-200 mb-6"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Badges
          </button>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-5xl font-bold mb-4">{badge.name}</h1>
              <p className="text-2xl italic opacity-90 mb-6">
                "{badge.identity_statement}"
              </p>
              <p className="text-lg opacity-90 max-w-3xl">
                {badge.description}
              </p>

              {/* Badge Stats */}
              <div className="flex gap-8 mt-8">
                <div>
                  <div className="text-3xl font-bold">{badge.min_quests}</div>
                  <div className="text-sm opacity-80">Required Quests</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">{badge.min_xp}</div>
                  <div className="text-sm opacity-80">Minimum XP</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">{(badge.min_xp / 1000).toFixed(1)}</div>
                  <div className="text-sm opacity-80">Academic Credits</div>
                </div>
              </div>
            </div>

            {/* Status Badge */}
            {isCompleted && (
              <div className="bg-green-500 text-white px-6 py-3 rounded-lg font-bold text-lg">
                COMPLETED
              </div>
            )}
            {isActive && !isCompleted && (
              <div className="bg-blue-500 text-white px-6 py-3 rounded-lg font-bold text-lg">
                IN PROGRESS
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Progress Section (if active) */}
        {isActive && userProgress && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">Your Progress</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-3xl font-bold text-purple-600">
                  {userProgress.percentage || 0}%
                </div>
                <div className="text-gray-600">Overall Progress</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-purple-600">
                  {userProgress.quests_completed}/{badge.min_quests}
                </div>
                <div className="text-gray-600">Quests Completed</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-purple-600">
                  {userProgress.xp_earned}/{badge.min_xp}
                </div>
                <div className="text-gray-600">XP Earned</div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-6">
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className={`bg-gradient-to-r ${gradientClass} h-4 rounded-full transition-all`}
                  style={{ width: `${userProgress.percentage || 0}%` }}
                ></div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex gap-4">
              <button
                onClick={handlePauseBadge}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Pause Badge
              </button>
            </div>
          </div>
        )}

        {/* Select Badge Button (if not active) */}
        {!isActive && !isCompleted && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">Ready to Start?</h2>
            <p className="text-gray-600 mb-6">
              Select this badge to begin your learning journey. You'll be able to complete quests
              and track your progress toward earning this badge.
            </p>
            <button
              onClick={handleSelectBadge}
              disabled={selecting}
              className={`px-8 py-3 bg-gradient-to-r ${gradientClass} text-white rounded-lg font-bold text-lg hover:opacity-90 transition-opacity ${
                selecting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {selecting ? 'Selecting...' : 'Start This Badge'}
            </button>
          </div>
        )}

        {/* Required Quests */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-6">Required Quests</h2>
          {badge.required_quests && badge.required_quests.length > 0 ? (
            <div className="space-y-4">
              {badge.required_quests.map((quest, index) => (
                <QuestListItem
                  key={quest.id}
                  quest={quest}
                  index={index}
                  isCompleted={quest.is_completed}
                  onClick={() => handleQuestClick(quest.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No required quests yet.</p>
          )}
        </div>

        {/* Optional Quests */}
        {badge.optional_quests && badge.optional_quests.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold mb-6">Optional Quests</h2>
            <div className="space-y-4">
              {badge.optional_quests.map((quest, index) => (
                <QuestListItem
                  key={quest.id}
                  quest={quest}
                  index={index}
                  isCompleted={quest.is_completed}
                  isOptional={true}
                  onClick={() => handleQuestClick(quest.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestListItem({ quest, index, isCompleted, isOptional, onClick }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
    >
      {/* Order Number / Status Icon */}
      <div className="flex-shrink-0 mr-4">
        {isCompleted ? (
          <CheckCircle className="w-8 h-8 text-green-500" />
        ) : (
          <Circle className="w-8 h-8 text-gray-300" />
        )}
      </div>

      {/* Quest Content */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-lg text-gray-900">{quest.title}</h3>
          {isOptional && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
              Optional
            </span>
          )}
          {isCompleted && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
              Completed
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 line-clamp-2">{quest.description}</p>
      </div>

      {/* Arrow Icon */}
      <div className="flex-shrink-0 ml-4 text-gray-400">
        →
      </div>
    </div>
  );
}
