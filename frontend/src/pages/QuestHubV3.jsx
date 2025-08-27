import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import QuestCardV3 from '../components/quest/QuestCardV3';
import TeamUpModal from '../components/quest/TeamUpModal';

const QuestHubV3 = () => {
  const { user } = useAuth();
  const [quests, setQuests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPillar, setSelectedPillar] = useState('all');
  const [showTeamUpModal, setShowTeamUpModal] = useState(false);
  const [selectedQuestForTeamUp, setSelectedQuestForTeamUp] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const pillars = [
    { value: 'all', label: 'All Quests', color: 'from-gray-500 to-gray-600' },
    { value: 'creativity', label: 'Creativity', color: 'from-purple-500 to-pink-500' },
    { value: 'critical_thinking', label: 'Critical Thinking', color: 'from-blue-500 to-cyan-500' },
    { value: 'practical_skills', label: 'Practical Skills', color: 'from-green-500 to-emerald-500' },
    { value: 'communication', label: 'Communication', color: 'from-orange-500 to-yellow-500' },
    { value: 'cultural_literacy', label: 'Cultural Literacy', color: 'from-red-500 to-rose-500' }
  ];

  useEffect(() => {
    fetchQuests();
  }, [page, searchTerm, selectedPillar]);

  const fetchQuests = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page,
        per_page: 12,
        ...(searchTerm && { search: searchTerm }),
        ...(selectedPillar !== 'all' && { pillar: selectedPillar })
      });

      const response = await fetch(`/api/v3/quests?${params}`, {
        headers: user ? {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        } : {}
      });

      if (!response.ok) {
        throw new Error('Failed to fetch quests');
      }

      const data = await response.json();
      setQuests(data.quests || []);
      setTotalPages(data.total_pages || 1);
    } catch (error) {
      console.error('Error fetching quests:', error);
      setError('Failed to load quests. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnroll = async (questId) => {
    if (!user) {
      // Redirect to login
      window.location.href = '/login';
      return;
    }

    try {
      const response = await fetch(`/api/v3/quests/${questId}/enroll`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to enroll');
      }

      // Update quest in state to show enrollment
      setQuests(quests.map(q => 
        q.id === questId 
          ? { ...q, user_enrollment: data.enrollment }
          : q
      ));

      // Show success message
      alert(data.message);
    } catch (error) {
      console.error('Error enrolling in quest:', error);
      alert(error.message || 'Failed to enroll in quest');
    }
  };

  const handleTeamUp = (quest) => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setSelectedQuestForTeamUp(quest);
    setShowTeamUpModal(true);
  };

  const handleInviteSent = (result) => {
    alert(result.message);
    // Could also update UI to show pending invitation
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Quest Hub</h1>
          <p className="text-gray-600">Choose your adventure and start earning XP!</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search quests..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Pillar Filter */}
            <div className="flex gap-2 flex-wrap">
              {pillars.map(pillar => (
                <button
                  key={pillar.value}
                  onClick={() => {
                    setSelectedPillar(pillar.value);
                    setPage(1);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    selectedPillar === pillar.value
                      ? `bg-gradient-to-r ${pillar.color} text-white shadow-lg`
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {pillar.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Quest Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : quests.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-md">
            <svg className="mx-auto h-16 w-16 text-gray-400 mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path fillRule="evenodd" d="M4 5a2 2 0 012-2 1 1 0 000 2H6a2 2 0 100 4h2a2 2 0 100-4h-.5a1 1 0 000-2H8a2 2 0 012-2z" clipRule="evenodd" />
            </svg>
            <p className="text-gray-600 text-lg mb-2">No quests found</p>
            <p className="text-gray-500">Try adjusting your filters or check back later for new quests!</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {quests.map(quest => (
                <QuestCardV3
                  key={quest.id}
                  quest={quest}
                  onEnroll={handleEnroll}
                  onTeamUp={handleTeamUp}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                
                <div className="flex items-center gap-2">
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                          page === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Team Up Modal */}
      {showTeamUpModal && selectedQuestForTeamUp && (
        <TeamUpModal
          quest={selectedQuestForTeamUp}
          onClose={() => {
            setShowTeamUpModal(false);
            setSelectedQuestForTeamUp(null);
          }}
          onInviteSent={handleInviteSent}
        />
      )}
    </div>
  );
};

export default QuestHubV3;