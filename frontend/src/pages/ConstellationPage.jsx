import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ConstellationView from '../components/constellation/ConstellationView';
import api from '../services/api';
import toast from 'react-hot-toast';

const ConstellationPage = () => {
  const { user } = useAuth();
  const [badges, setBadges] = useState([]);
  const [userBadges, setUserBadges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch all badges
      const badgesResponse = await api.get('/api/badges');
      setBadges(badgesResponse.data.badges || []);

      // Fetch user's badge progress
      if (user?.id) {
        const userBadgesResponse = await api.get(`/api/badges/user/${user.id}`);
        setUserBadges(userBadgesResponse.data.user_badges || []);
      }
    } catch (error) {
      console.error('Error fetching constellation data:', error);
      toast.error('Failed to load constellation data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-8"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-transparent bg-clip-text">
            Learning Constellation
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Your unique learning journey visualized as a constellation. Each star represents a badge,
            and connections form as you build mastery across pillars.
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-green-600">
              {userBadges.filter(b => b.is_earned).length}
            </div>
            <div className="text-sm text-gray-600">Stars Earned</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-blue-600">
              {userBadges.filter(b => !b.is_earned && b.completed_quests > 0).length}
            </div>
            <div className="text-sm text-gray-600">In Progress</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-gray-600">
              {badges.length - userBadges.length}
            </div>
            <div className="text-sm text-gray-600">Undiscovered</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-3xl font-bold text-purple-600">
              {badges.length}
            </div>
            <div className="text-sm text-gray-600">Total Stars</div>
          </div>
        </div>

        {/* Constellation View */}
        <ConstellationView badges={badges} userBadges={userBadges} />

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-bold text-gray-900 mb-3">How to Read Your Constellation</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-700">
            <div>
              <p className="font-medium mb-1">Earned Stars (Full Color)</p>
              <p className="text-gray-600">Badges you've completed appear bright with a green checkmark</p>
            </div>
            <div>
              <p className="font-medium mb-1">In-Progress Stars (Faded)</p>
              <p className="text-gray-600">Badges you're working on with partial progress shown</p>
            </div>
            <div>
              <p className="font-medium mb-1">Connections (Lines)</p>
              <p className="text-gray-600">Solid lines connect earned badges in the same pillar</p>
            </div>
            <div>
              <p className="font-medium mb-1">Hover for Details</p>
              <p className="text-gray-600">Hover over any star to see badge name and progress</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConstellationPage;
