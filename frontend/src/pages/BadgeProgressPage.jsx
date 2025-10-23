import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import BadgeProgress from '../components/badge/BadgeProgress';
import api from '../services/api';
import toast from 'react-hot-toast';

const BadgeProgressPage = () => {
  const { user } = useAuth();
  const [allBadges, setAllBadges] = useState([]);
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
      setAllBadges(badgesResponse.data.badges || []);

      // Fetch user's badge progress
      if (user?.id) {
        const userBadgesResponse = await api.get(`/api/badges/user/${user.id}`);
        setUserBadges(userBadgesResponse.data.user_badges || []);
      }
    } catch (error) {
      console.error('Error fetching badge progress:', error);
      toast.error('Failed to load badge progress');
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
          <h1 className="text-4xl font-bold mb-4 bg-gradient-primary text-transparent bg-clip-text">
            Badge Progress
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Track your badge achievements across all five learning pillars. See your progress,
            celebrate milestones, and discover what's next on your journey.
          </p>
        </div>

        {/* Badge Progress Component */}
        <BadgeProgress userBadges={userBadges} allBadges={allBadges} />

        {/* CTA Section */}
        <div className="mt-8 bg-gradient-primary text-white rounded-lg p-6 text-center">
          <h3 className="text-xl font-bold mb-2">Keep Building Your Skills</h3>
          <p className="mb-4">Explore new badges and continue your learning journey</p>
          <a
            href="/badges"
            className="inline-block bg-white text-gray-900 font-medium px-6 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Browse All Badges
          </a>
        </div>
      </div>
    </div>
  );
};

export default BadgeProgressPage;
