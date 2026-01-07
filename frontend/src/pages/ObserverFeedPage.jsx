import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { observerAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { FeedCard } from '../components/observer';
import {
  UsersIcon,
  SparklesIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon
} from '@heroicons/react/24/outline';

export default function ObserverFeedPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siteSettings, setSiteSettings] = useState(null);

  // Fetch site settings for logo
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}/api/settings`);
        if (response.ok) {
          const data = await response.json();
          setSiteSettings(data);
        }
      } catch (error) {
        // Silent fail - use fallback
      }
    };
    fetchSettings();
  }, []);
  const [selectedStudentId, setSelectedStudentId] = useState(null); // null = all students
  const [feedItems, setFeedItems] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState(null);

  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);

  useEffect(() => {
    fetchMyStudents();
  }, []);

  // Reset feed when student filter changes
  useEffect(() => {
    setFeedItems([]);
    setNextCursor(null);
    setHasMore(true);
    fetchFeed(true);
  }, [selectedStudentId]);

  const fetchMyStudents = async () => {
    try {
      setLoading(true);
      const response = await observerAPI.getMyStudents();
      setStudents(response.data.students || []);
    } catch (error) {
      console.error('Failed to fetch students:', error);
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const fetchFeed = async (reset = false) => {
    if (feedLoading || (!hasMore && !reset)) return;

    setFeedLoading(true);
    try {
      const params = {
        limit: 20,
        cursor: reset ? undefined : nextCursor
      };

      if (selectedStudentId) {
        params.studentId = selectedStudentId;
      }

      const response = await observerAPI.getFeed(params);
      const newItems = response.data.items || [];

      if (reset) {
        setFeedItems(newItems);
      } else {
        setFeedItems(prev => [...prev, ...newItems]);
      }

      setHasMore(response.data.has_more);
      setNextCursor(response.data.next_cursor);
    } catch (error) {
      console.error('Failed to fetch feed:', error);
      if (reset) {
        toast.error('Failed to load feed');
      }
    } finally {
      setFeedLoading(false);
    }
  };

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !feedLoading) {
          fetchFeed();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, feedLoading, nextCursor]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      toast.error('Failed to log out');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
        {/* Simple header for empty state */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center">
              {siteSettings?.logo_url ? (
                <img
                  src={siteSettings.logo_url}
                  alt={siteSettings.site_name || "Optio"}
                  className="h-8 w-auto"
                />
              ) : (
                <span className="text-2xl font-bold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
                  Optio
                </span>
              )}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
            >
              <ArrowRightOnRectangleIcon className="w-5 h-5" />
              <span>Log out</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center p-4 mt-20">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
            <UsersIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">No Students Linked Yet</h2>
            <p className="text-gray-600 mb-6">
              You haven't been linked to any students yet. Ask a parent to send you an invitation link so you can follow their child's learning journey.
            </p>
            <p className="text-sm text-gray-500">
              Once connected, you'll see student activity and achievements here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const selectedStudent = students.find(s => s.student_id === selectedStudentId);

  const userName = user?.display_name || user?.first_name || 'Observer';
  const isSuperadmin = user?.role === 'superadmin';

  return (
    <div className={`min-h-screen ${isSuperadmin ? '' : 'bg-gray-50'}`}>
      {/* Observer Header - only show for non-superadmin users (superadmins use Layout) */}
      {!isSuperadmin && (
        <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              {/* Logo and Title */}
              <div className="flex items-center gap-4">
                <Link to="/observer/feed" className="flex items-center">
                  {siteSettings?.logo_url ? (
                    <img
                      src={siteSettings.logo_url}
                      alt={siteSettings.site_name || "Optio"}
                      className="h-8 w-auto"
                    />
                  ) : (
                    <span className="text-2xl font-bold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
                      Optio
                    </span>
                  )}
                </Link>
                <div className="h-6 w-px bg-gray-200 hidden sm:block" />
                <div className="hidden sm:block">
                  <h1 className="text-lg font-semibold text-gray-900">Observer Feed</h1>
                </div>
              </div>

              {/* User Controls */}
              <div className="flex items-center gap-3">
                <Link
                  to="/observer/welcome"
                  className="text-optio-purple hover:text-optio-pink font-medium text-sm items-center gap-1 hidden sm:flex"
                >
                  <SparklesIcon className="w-4 h-4" />
                  Tips
                </Link>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <UserCircleIcon className="w-5 h-5" />
                  <span className="hidden sm:inline">{userName}</span>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
                  title="Log out"
                >
                  <ArrowRightOnRectangleIcon className="w-5 h-5" />
                  <span className="hidden sm:inline">Log out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-4 gap-6">
          {/* Sidebar - Student Filter */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 sticky top-24">
              <h2 className="font-semibold text-gray-900 mb-3">
                Filter by Student
              </h2>
              <div className="space-y-2">
                {/* All Students Option */}
                <button
                  onClick={() => setSelectedStudentId(null)}
                  className={`w-full text-left p-3 rounded-lg transition-all ${
                    selectedStudentId === null
                      ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-800'
                  }`}
                >
                  <div className="font-medium flex items-center gap-2">
                    <UsersIcon className="w-4 h-4" />
                    All Students
                  </div>
                  <div className={`text-xs ${selectedStudentId === null ? 'text-purple-100' : 'text-gray-500'}`}>
                    Combined feed
                  </div>
                </button>

                {/* Individual Students */}
                {students.map(link => {
                  const studentName = link.student?.display_name ||
                    `${link.student?.first_name || ''} ${link.student?.last_name || ''}`.trim() ||
                    'Student';

                  return (
                    <button
                      key={link.student_id}
                      onClick={() => setSelectedStudentId(link.student_id)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        selectedStudentId === link.student_id
                          ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                          : 'bg-gray-50 hover:bg-gray-100 text-gray-800'
                      }`}
                    >
                      <div className="font-medium truncate">
                        {studentName}
                      </div>
                      <div className={`text-xs capitalize ${selectedStudentId === link.student_id ? 'text-purple-100' : 'text-gray-500'}`}>
                        {link.relationship?.replace('_', ' ') || 'Observer'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Feed */}
          <div className="md:col-span-3">
            <div className="space-y-4">
              {/* Feed Header */}
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedStudentId
                    ? `${selectedStudent?.student?.display_name || selectedStudent?.student?.first_name || 'Student'}'s Activity`
                    : 'Recent Activity'}
                </h2>
                <p className="text-sm text-gray-500">
                  {selectedStudentId
                    ? 'Recent task completions and achievements'
                    : `Activity from all ${students.length} linked students`}
                </p>
              </div>

              {/* Feed Items */}
              {feedItems.length > 0 ? (
                <>
                  {feedItems.map(item => (
                    <FeedCard
                      key={item.id}
                      item={item}
                      showStudentName={!selectedStudentId}
                    />
                  ))}

                  {/* Load More Trigger */}
                  <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
                    {feedLoading && (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-optio-purple" />
                    )}
                    {!hasMore && feedItems.length > 0 && (
                      <p className="text-gray-400 text-sm">You've reached the end</p>
                    )}
                  </div>
                </>
              ) : feedLoading ? (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-optio-purple mx-auto" />
                  <p className="text-gray-500 mt-4">Loading activity...</p>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                  <SparklesIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Activity Yet</h3>
                  <p className="text-gray-600 max-w-md mx-auto">
                    {selectedStudentId
                      ? "This student hasn't completed any tasks yet. Check back soon!"
                      : "Your linked students haven't completed any tasks yet. Completed work will appear here."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
