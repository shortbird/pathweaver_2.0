import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { CheckCircle, Circle, ArrowLeft, Trophy, Target, Zap, Info, Lock, Crown } from 'lucide-react';
import { BadgePillarIcon } from '../components/badges/BadgePillarIcon';
import BadgeInfoModal from '../components/badges/BadgeInfoModal';
import { useAuth } from '../contexts/AuthContext';
import { getPillarGradient } from '../config/pillars';

export default function BadgeDetail() {
  const { badgeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [badge, setBadge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Check if user is on free tier
  const isFreeTier = user?.subscription_tier === 'Free';

  useEffect(() => {
    // Scroll to top handled globally by ScrollToTop component
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
    // Check if user is on free tier
    if (isFreeTier) {
      toast.error('Badges are a paid feature. Upgrade to unlock!');
      navigate('/subscription');
      return;
    }

    setSelecting(true);
    try {
      await api.post(`/api/badges/${badgeId}/select`, {});
      toast.success('Badge selected! Ready to start your first quest?');
      await fetchBadgeDetail();
    } catch (error) {
      console.error('Error selecting badge:', error);
      const errorMessage = error.response?.data?.error || 'Failed to select badge';
      toast.error(errorMessage);

      // If backend says upgrade required, redirect to subscription page
      if (error.response?.data?.requires_upgrade) {
        setTimeout(() => navigate('/subscription'), 1500);
      }
    } finally {
      setSelecting(false);
    }
  };

  const handlePauseBadge = async () => {
    try {
      await api.post(`/api/badges/${badgeId}/pause`, {});
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gradient-to-r bg-gradient-primary-reverse mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading badge...</p>
        </div>
      </div>
    );
  }

  if (!badge) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Badge not found</p>
          <button
            onClick={() => navigate('/badges')}
            className="px-6 py-2 bg-gradient-to-r bg-gradient-primary-reverse text-white rounded-lg hover:opacity-90"
          >
            Back to Badges
          </button>
        </div>
      </div>
    );
  }

  // Legacy pillar name mappings for backward compatibility
  const legacyPillarMapping = {
    'Arts & Creativity': 'art',
    'STEM & Logic': 'stem',
    'Life & Wellness': 'wellness',
    'Language & Communication': 'communication',
    'Society & Culture': 'civics'
  };

  // Normalize pillar key and get gradient from centralized config
  const normalizedPillar = legacyPillarMapping[badge.pillar_primary] || badge.pillar_primary?.toLowerCase() || 'art';
  const gradientClass = getPillarGradient(normalizedPillar);

  const userProgress = badge.user_progress;
  const isActive = userProgress?.is_active && !userProgress?.completed_at;
  const isCompleted = userProgress?.completed_at;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section - Redesigned */}
      <div className={`bg-gradient-to-br ${gradientClass} text-white py-16 relative overflow-hidden`}>
        {/* Large faded background icon */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
          <BadgePillarIcon pillar={badge.pillar_primary} className="w-96 h-96 text-white" />
        </div>

        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent"></div>

        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <button
            onClick={() => navigate('/badges')}
            className="flex items-center text-white hover:text-gray-100 mb-8 transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Badges
          </button>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
            {/* Badge Info */}
            <div className="flex-1">
              <h1 className="text-5xl font-bold mb-3 pb-1">{badge.name}</h1>
              <p className="text-2xl italic opacity-90 mb-4">
                "{badge.identity_statement}"
              </p>
              <p className="text-lg opacity-90 max-w-3xl leading-relaxed">
                {badge.description}
              </p>

              {/* Badge Stats - Redesigned */}
              <div className="grid grid-cols-3 gap-6 mt-8 max-w-2xl">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-3xl font-bold">{badge.min_quests}</div>
                  </div>
                  <div className="text-sm opacity-80">Required Quests</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-5 h-5" />
                    <div className="text-3xl font-bold">{badge.min_xp}</div>
                  </div>
                  <div className="text-sm opacity-80">Minimum XP</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <div className="text-3xl font-bold">{(badge.min_xp / 1000).toFixed(1)}</div>
                  </div>
                  <div className="text-sm opacity-80">Academic Credits</div>
                </div>
              </div>

              {/* Pillar Tag, Info Button, and Status Badge */}
              <div className="mt-6 flex items-center gap-3 flex-wrap">
                <span className="inline-block bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium">
                  {badge.pillar_primary}
                </span>
                <button
                  onClick={() => setShowInfoModal(true)}
                  className="inline-flex items-center gap-2 bg-white text-purple-700 hover:bg-purple-50 px-4 py-2 rounded-full text-sm font-semibold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                  aria-label="How to earn this badge"
                >
                  <Info className="w-4 h-4" />
                  How to Earn
                </button>

                {/* Status Badge - Moved here */}
                {isCompleted && (
                  <div className="bg-green-500 text-white px-5 py-2 rounded-full font-bold text-sm shadow-lg flex items-center gap-2">
                    <Trophy className="w-4 h-4" />
                    COMPLETED
                  </div>
                )}
                {isActive && !isCompleted && (
                  <div className="bg-green-500 text-white px-5 py-2 rounded-full font-bold text-sm shadow-lg flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    IN PROGRESS
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Modal */}
      <BadgeInfoModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        badge={badge}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Progress Section (if active) - Redesigned */}
        {isActive && userProgress && (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <Target className="w-6 h-6 text-purple-600" />
              <h2 className="text-2xl font-bold">Your Progress</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="text-center md:text-left">
                <div className="text-4xl font-bold bg-gradient-to-r bg-gradient-primary-reverse bg-clip-text text-transparent">
                  {userProgress.percentage || 0}%
                </div>
                <div className="text-gray-600 mt-1">Overall Progress</div>
              </div>
              <div className="text-center md:text-left">
                <div className="text-4xl font-bold text-gray-900">
                  {userProgress.quests_completed}
                  <span className="text-2xl text-gray-400">/{badge.min_quests}</span>
                </div>
                <div className="text-gray-600 mt-1">Quests Completed</div>
              </div>
              <div className="text-center md:text-left">
                <div className="text-4xl font-bold text-gray-900">
                  {userProgress.xp_earned}
                  <span className="text-2xl text-gray-400">/{badge.min_xp}</span>
                </div>
                <div className="text-gray-600 mt-1">XP Earned</div>
              </div>
            </div>

            {/* Enhanced Progress Bar */}
            <div className="mb-6">
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`bg-gradient-to-r ${gradientClass} h-3 rounded-full transition-all duration-500 ease-out relative`}
                  style={{ width: `${userProgress.percentage || 0}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 animate-shimmer"></div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handlePauseBadge}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              >
                Pause Badge
              </button>
            </div>
          </div>
        )}

        {/* Select Badge Section (if not active) - Redesigned */}
        {!isActive && !isCompleted && (
          <div className={`rounded-xl shadow-lg p-8 mb-8 border-2 ${
            isFreeTier
              ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200'
              : 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-100'
          }`}>
            {isFreeTier ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <Crown className="w-8 h-8 text-amber-600" />
                  <h2 className="text-2xl font-bold text-gray-900">Unlock Badges with a Paid Plan</h2>
                </div>
                <p className="text-gray-700 mb-6 leading-relaxed">
                  Badges are an exclusive feature for paid subscribers. Upgrade to start pursuing badges,
                  track your progress across quests, and showcase your achievements on your diploma.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => navigate('/subscription')}
                    className="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold text-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                  >
                    <Crown className="w-5 h-5" />
                    Upgrade Now
                  </button>
                  <button
                    onClick={() => navigate('/badges')}
                    className="px-8 py-4 border-2 border-gray-300 text-gray-700 rounded-xl font-bold text-lg hover:bg-gray-50 transition-all"
                  >
                    Browse Other Badges
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-4">
                  You can still view badges on the free tier, but you'll need to upgrade to start pursuing them.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-4">Ready to Start Your Journey?</h2>
                <p className="text-gray-700 mb-6 leading-relaxed">
                  Select this badge to begin your learning adventure. You'll be able to complete quests,
                  track your progress, and earn this badge as you develop new skills.
                </p>
                <button
                  onClick={handleSelectBadge}
                  disabled={selecting}
                  className={`px-8 py-4 bg-gradient-to-r ${gradientClass} text-white rounded-xl font-bold text-lg hover:shadow-xl hover:-translate-y-0.5 transition-all ${
                    selecting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {selecting ? 'Selecting...' : 'Start This Badge'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Related Quests - Redesigned */}
        <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100">
          <div className="flex flex-col sm:flex-row items-start sm:items-baseline justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold">Quests Related to {badge.name}</h2>
            <p className="text-gray-600 text-sm">
              Complete {badge.min_quests} quests to earn this badge
            </p>
          </div>

          {(badge.required_quests && badge.required_quests.length > 0) ||
           (badge.optional_quests && badge.optional_quests.length > 0) ? (
            <div className="space-y-3">
              {[...(badge.required_quests || []), ...(badge.optional_quests || [])].map((quest, index) => (
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
            <div className="text-center py-12">
              <div className="text-gray-400 mb-2">
                <Circle className="w-16 h-16 mx-auto" />
              </div>
              <p className="text-gray-500">No quests linked to this badge yet.</p>
              <p className="text-gray-400 text-sm mt-1">Check back soon for new learning opportunities!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestListItem({ quest, index, isCompleted, onClick }) {
  return (
    <div
      onClick={onClick}
      className="group flex items-center p-5 border-2 border-gray-100 rounded-xl hover:border-purple-200 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer bg-white"
    >
      {/* Status Icon */}
      <div className="flex-shrink-0 mr-4">
        {isCompleted ? (
          <div className="bg-green-100 rounded-full p-2">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
        ) : (
          <div className="bg-gray-100 rounded-full p-2 group-hover:bg-purple-50 transition-colors">
            <Circle className="w-6 h-6 text-gray-400 group-hover:text-purple-400" />
          </div>
        )}
      </div>

      {/* Quest Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h3 className="font-semibold text-lg text-gray-900 group-hover:text-purple-600 transition-colors">
            {quest.title}
          </h3>
          {isCompleted && (
            <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
              Completed
            </span>
          )}
          {quest.xp_contributed > 0 && (
            <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {quest.xp_contributed} XP
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
          {quest.description}
        </p>
      </div>

      {/* Arrow Icon */}
      <div className="flex-shrink-0 ml-4 text-gray-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}
