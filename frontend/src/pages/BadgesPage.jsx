import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import CourseCard from '../components/courses/CourseCard';
import api from '../services/api';
import courseService from '../services/courseService';
import toast from 'react-hot-toast';

const BadgesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Course state
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState({});
  const [coursesLoading, setCoursesLoading] = useState(true);

  // Badge state
  const [allBadges, setAllBadges] = useState([]);
  const [userBadges, setUserBadges] = useState([]);
  const [claimableBadges, setClaimableBadges] = useState([]);
  const [badgesLoading, setBadgesLoading] = useState(true);

  // UI state
  const [showCourses, setShowCourses] = useState(true);

  useEffect(() => {
    fetchCourses();
    fetchBadges();
  }, [user]);

  const fetchCourses = async () => {
    try {
      setCoursesLoading(true);
      const response = await courseService.getCourses();
      // Only show published courses to students
      const coursesData = (response.courses || []).filter(c => c.status === 'published');
      setCourses(coursesData);

      // Fetch enrollments for each course
      if (user?.id && coursesData.length > 0) {
        const enrollmentMap = {};
        for (const course of coursesData) {
          try {
            const progressResponse = await courseService.getCourseProgress(course.id);
            if (progressResponse.progress) {
              enrollmentMap[course.id] = {
                completed_quests: progressResponse.progress.quests_completed || 0,
                total_quests: progressResponse.progress.total_quests || 0,
                status: progressResponse.progress.percentage === 100 ? 'completed' : 'active'
              };
            }
          } catch (error) {
            // Not enrolled in this course - that's okay
            enrollmentMap[course.id] = null;
          }
        }
        setEnrollments(enrollmentMap);
      }
    } catch (error) {
      console.error('Error fetching courses:', error);
      toast.error('Failed to load courses');
    } finally {
      setCoursesLoading(false);
    }
  };

  const fetchBadges = async () => {
    try {
      setBadgesLoading(true);

      // Fetch all badges
      const badgesResponse = await api.get('/api/badges');
      const badges = badgesResponse.data.badges || [];
      setAllBadges(badges);

      // Fetch user's badges
      if (user?.id) {
        const userBadgesResponse = await api.get(`/api/badges/user/${user.id}`);
        const userBadgesData = userBadgesResponse.data.user_badges || [];
        setUserBadges(userBadgesData);

        // Filter claimable badges (not yet claimed but requirements met)
        const earnedBadgeIds = new Set(userBadgesData.map(ub => ub.badge_id));
        const claimable = badges.filter(badge =>
          !earnedBadgeIds.has(badge.id) && badge.status === 'active'
        );
        setClaimableBadges(claimable);
      }
    } catch (error) {
      console.error('Error fetching badges:', error);
      toast.error('Failed to load badges');
    } finally {
      setBadgesLoading(false);
    }
  };

  if (coursesLoading && badgesLoading) {
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
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-optio-purple to-optio-pink text-transparent bg-clip-text">
            Badges & Courses
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Explore structured learning courses and earn badges as you master new skills across all five learning pillars.
          </p>
        </div>

        {/* Available Courses Section */}
        {courses.length > 0 && (
          <div className="mb-12">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Available Courses
              </h2>
              <button
                onClick={() => setShowCourses(!showCourses)}
                className="text-optio-purple hover:text-optio-pink font-medium flex items-center gap-2 min-h-[44px]"
              >
                {showCourses ? 'Hide' : 'Show'}
                <svg
                  className={`w-5 h-5 transform transition-transform ${showCourses ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {showCourses && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {courses.map(course => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    enrollment={enrollments[course.id]}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Your Badges Section */}
        {userBadges.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Badges</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {userBadges.map(userBadge => {
                const badge = allBadges.find(b => b.id === userBadge.badge_id);
                if (!badge) return null;

                return (
                  <div
                    key={userBadge.id}
                    onClick={() => navigate(`/badges/${badge.id}`)}
                    className="bg-white rounded-lg shadow-md border-2 border-optio-purple overflow-hidden cursor-pointer hover:shadow-xl transition-all duration-300 flex flex-col items-center p-6 min-h-[140px]"
                  >
                    {badge.image_url ? (
                      <img
                        src={badge.image_url}
                        alt={badge.name}
                        className="w-full max-h-[80px] object-contain rounded-full mb-4"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center mb-4">
                        <span className="text-4xl">🏆</span>
                      </div>
                    )}
                    <h3 className="font-bold text-center text-sm text-gray-900 line-clamp-2">
                      {badge.name}
                    </h3>
                    <p className="text-xs text-gray-600 mt-2 text-center">
                      {badge.pillar_primary}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Claimable Badges Section */}
        {claimableBadges.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Claimable Badges</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {claimableBadges.slice(0, 8).map(badge => (
                <div
                  key={badge.id}
                  onClick={() => navigate(`/badges/${badge.id}`)}
                  className="bg-white rounded-lg shadow-md border-2 border-gray-100 overflow-hidden cursor-pointer hover:shadow-xl hover:border-optio-purple transition-all duration-300 flex flex-col items-center p-6 min-h-[140px]"
                >
                  {badge.image_url ? (
                    <img
                      src={badge.image_url}
                      alt={badge.name}
                      className="w-full max-h-[80px] object-contain rounded-full mb-4"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center mb-4">
                      <span className="text-4xl">🎯</span>
                    </div>
                  )}
                  <h3 className="font-bold text-center text-sm text-gray-900 line-clamp-2">
                    {badge.name}
                  </h3>
                  <p className="text-xs text-gray-600 mt-2 text-center">
                    {badge.pillar_primary}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Explore All Badges Section */}
        {allBadges.length > claimableBadges.length && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Explore Badges</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {allBadges
                .filter(badge => !userBadges.some(ub => ub.badge_id === badge.id))
                .slice(0, 8)
                .map(badge => (
                  <div
                    key={badge.id}
                    onClick={() => navigate(`/badges/${badge.id}`)}
                    className="bg-white rounded-lg shadow-md border-2 border-gray-100 overflow-hidden cursor-pointer hover:shadow-xl hover:border-optio-purple transition-all duration-300 flex flex-col items-center p-6 min-h-[140px]"
                  >
                    {badge.image_url ? (
                      <img
                        src={badge.image_url}
                        alt={badge.name}
                        className="w-full max-h-[80px] object-contain rounded-full mb-4 opacity-60"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center mb-4 opacity-60">
                        <span className="text-4xl">🔒</span>
                      </div>
                    )}
                    <h3 className="font-bold text-center text-sm text-gray-900 line-clamp-2">
                      {badge.name}
                    </h3>
                    <p className="text-xs text-gray-600 mt-2 text-center">
                      {badge.pillar_primary}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 text-center">
                      {badge.min_xp} XP • {badge.min_quests} Quests
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {courses.length === 0 && allBadges.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎯</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No Courses or Badges Available</h2>
            <p className="text-gray-600">Check back soon for new learning opportunities!</p>
          </div>
        )}

        {/* CTA Section */}
        <div className="mt-12 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg p-8 text-center">
          <h3 className="text-2xl font-bold mb-3">Ready to Start Your Journey?</h3>
          <p className="mb-6 text-lg">
            Explore quests, join courses, and earn badges as you build skills across all five learning pillars.
          </p>
          <button
            onClick={() => navigate('/quests')}
            className="inline-block bg-white text-optio-purple font-semibold px-8 py-3 rounded-lg hover:bg-gray-100 transition-colors shadow-lg min-h-[44px]"
          >
            Explore Quests
          </button>
        </div>
      </div>
    </div>
  );
};

export default BadgesPage;
