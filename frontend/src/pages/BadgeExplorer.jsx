import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import BadgeCard from '../components/badges/BadgeCard';

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
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-[#f8b3c5] bg-clip-text text-transparent mb-4">Explore Learning Paths</h1>
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

// BadgeCard component moved to components/badges/BadgeCard.jsx
