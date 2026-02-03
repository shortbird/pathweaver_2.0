import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { SparklesIcon, ArrowTrendingUpIcon, FireIcon } from '@heroicons/react/24/outline';
import { getPillarGradient } from '../../config/pillars';

export default function BadgeRecommendations({ userId }) {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (userId) {
      fetchRecommendations();
    }
  }, [userId]);

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/ai-generation/recommendations/badges?limit=3');
      setRecommendations(response.data.recommendations || []);
    } catch (error) {
      console.error('Error fetching badge recommendations:', error);
      setError('Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  const handleBadgeClick = (badgeId) => {
    navigate(`/badges/${badgeId}`);
  };

  const handleViewAll = () => {
    navigate('/badges');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Recommended Learning Paths</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        </div>
      </div>
    );
  }

  if (error || recommendations.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Recommended Learning Paths</h2>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">
            Complete some quests to get personalized badge recommendations!
          </p>
          <button
            onClick={handleViewAll}
            className="text-optio-purple hover:text-purple-700 font-medium"
          >
            Browse All Badges →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Recommended Learning Paths</h2>
        </div>
        <button
          onClick={handleViewAll}
          className="min-h-[44px] text-sm text-optio-purple hover:text-purple-800 font-medium transition-colors"
        >
          View All Badges →
        </button>
      </div>

      <div className="space-y-4">
        {recommendations.map((badge) => (
          <BadgeRecommendationCard
            key={badge.id}
            badge={badge}
            onClick={() => handleBadgeClick(badge.id)}
          />
        ))}
      </div>
    </div>
  );
}

function BadgeRecommendationCard({ badge, onClick }) {
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
  const score = badge.recommendation_score || 0;
  const scorePercentage = Math.round(score * 100);

  // Determine match level based on score
  let matchLevel = 'Good Match';
  let matchIcon = <FireIcon className="w-4 h-4" />;

  if (score >= 0.8) {
    matchLevel = 'Perfect Match';
    matchIcon = <SparklesIcon className="w-4 h-4" />;
  } else if (score >= 0.6) {
    matchLevel = 'Great Match';
    matchIcon = <ArrowTrendingUpIcon className="w-4 h-4" />;
  }

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:shadow-md transition-all cursor-pointer group"
    >
      {/* Badge Icon */}
      <div className={`flex-shrink-0 w-16 h-16 bg-gradient-to-br ${gradientClass} rounded-lg flex items-center justify-center text-white text-2xl font-bold shadow-md`}>
        {badge.name.charAt(0)}
      </div>

      {/* Badge Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-gray-900 group-hover:text-optio-purple transition-colors truncate">
            {badge.name}
          </h3>
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs bg-gradient-primary text-white px-2 py-1 rounded-full">
            {matchIcon}
            {matchLevel}
          </span>
        </div>

        <p className="text-sm text-gray-600 mb-2 line-clamp-1">
          {badge.identity_statement}
        </p>

        {/* Recommendation Reason */}
        {badge.recommendation_reason && (
          <p className="text-xs text-gray-500 italic line-clamp-1">
            {badge.recommendation_reason}
          </p>
        )}

        {/* Badge Stats */}
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span>{badge.min_quests} quests</span>
          <span>{badge.min_xp} XP</span>
          <span className="inline-block bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
            {badge.pillar_primary}
          </span>
        </div>
      </div>

      {/* Match Score Indicator */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center w-16">
        <div className="relative w-12 h-12">
          <svg className="transform -rotate-90 w-12 h-12">
            <circle
              cx="24"
              cy="24"
              r="20"
              stroke="#e5e7eb"
              strokeWidth="4"
              fill="none"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              stroke="url(#gradient)"
              strokeWidth="4"
              fill="none"
              strokeDasharray={`${scorePercentage * 1.25} ${125 - scorePercentage * 1.25}`}
              className="transition-all duration-500"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef597b" />
                <stop offset="100%" stopColor="#6d469b" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-gray-700">{scorePercentage}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
