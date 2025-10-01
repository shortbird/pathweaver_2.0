import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

const PILLARS = [
  'All',
  'STEM & Logic',
  'Life & Wellness',
  'Language & Communication',
  'Society & Culture',
  'Arts & Creativity'
];

export default function BadgeExplorer() {
  const navigate = useNavigate();
  const [badges, setBadges] = useState([]);
  const [filteredBadges, setFilteredBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPillar, setSelectedPillar] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchBadges();
  }, []);

  useEffect(() => {
    filterBadges();
  }, [selectedPillar, searchTerm, badges]);

  const fetchBadges = async () => {
    try {
      const response = await api.get('/api/badges');
      setBadges(response.data.badges || []);
    } catch (error) {
      console.error('Error fetching badges:', error);
      toast.error('Failed to load badges');
    } finally {
      setLoading(false);
    }
  };

  const filterBadges = () => {
    let filtered = badges;

    // Filter by pillar
    if (selectedPillar !== 'All') {
      filtered = filtered.filter(badge => badge.pillar_primary === selectedPillar);
    }

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(badge =>
        badge.name.toLowerCase().includes(search) ||
        badge.identity_statement.toLowerCase().includes(search) ||
        badge.description.toLowerCase().includes(search)
      );
    }

    setFilteredBadges(filtered);
  };

  const handleBadgeClick = (badgeId) => {
    navigate(`/badges/${badgeId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gradient-to-r from-[#ef597b] to-[#6d469b] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading badges...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-bold mb-4">Explore Learning Paths</h1>
          <p className="text-lg opacity-90">
            Choose a badge that sparks your curiosity and start your learning journey
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Pillar Filter */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Pillar
              </label>
              <div className="flex flex-wrap gap-2">
                {PILLARS.map(pillar => (
                  <button
                    key={pillar}
                    onClick={() => setSelectedPillar(pillar)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedPillar === pillar
                        ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {pillar}
                  </button>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="md:w-64">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                placeholder="Search badges..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Badge Grid */}
      <div className="container mx-auto px-4 py-8">
        {filteredBadges.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">
              No badges found matching your criteria.
            </p>
          </div>
        ) : (
          <>
            <p className="text-gray-600 mb-6">
              Showing {filteredBadges.length} {filteredBadges.length === 1 ? 'badge' : 'badges'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredBadges.map(badge => (
                <BadgeCard
                  key={badge.id}
                  badge={badge}
                  onClick={() => handleBadgeClick(badge.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BadgeCard({ badge, onClick }) {
  const pillarColors = {
    'STEM & Logic': 'from-blue-400 to-purple-500',
    'Life & Wellness': 'from-green-400 to-teal-500',
    'Language & Communication': 'from-yellow-400 to-orange-500',
    'Society & Culture': 'from-red-400 to-pink-500',
    'Arts & Creativity': 'from-purple-400 to-pink-500'
  };

  const gradientClass = pillarColors[badge.pillar_primary] || 'from-gray-400 to-gray-600';

  const userProgress = badge.user_progress;
  const isActive = userProgress && userProgress.is_active && !userProgress.completed_at;
  const isCompleted = userProgress && userProgress.completed_at;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden group"
    >
      {/* Badge Icon/Header */}
      <div className={`h-32 bg-gradient-to-br ${gradientClass} flex items-center justify-center relative`}>
        <div className="text-white text-5xl">
          {badge.name.charAt(0)}
        </div>

        {/* Status Badge */}
        {isCompleted && (
          <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            COMPLETED
          </div>
        )}
        {isActive && !isCompleted && (
          <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            IN PROGRESS
          </div>
        )}
        {badge.ai_generated && (
          <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
            AI
          </div>
        )}
      </div>

      {/* Badge Content */}
      <div className="p-4">
        <h3 className="font-bold text-lg mb-2 text-gray-900 group-hover:text-purple-600 transition-colors">
          {badge.name}
        </h3>

        <p className="text-sm text-gray-600 italic mb-3">
          "{badge.identity_statement}"
        </p>

        <p className="text-sm text-gray-700 mb-4 line-clamp-2">
          {badge.description}
        </p>

        {/* Progress Bar (if active) */}
        {isActive && userProgress && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>Progress</span>
              <span>{userProgress.progress_percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`bg-gradient-to-r ${gradientClass} h-2 rounded-full transition-all`}
                style={{ width: `${userProgress.progress_percentage}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Badge Metadata */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <div>
            <span className="font-medium">{badge.min_quests}</span> quests
          </div>
          <div>
            <span className="font-medium">{badge.min_xp}</span> XP
          </div>
        </div>

        {/* Pillar Tag */}
        <div className="mt-3">
          <span className="inline-block bg-gray-100 text-gray-700 text-xs px-3 py-1 rounded-full">
            {badge.pillar_primary}
          </span>
        </div>
      </div>
    </div>
  );
}
