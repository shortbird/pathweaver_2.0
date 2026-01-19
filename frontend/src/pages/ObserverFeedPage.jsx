import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { observerAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { FeedCard } from '../components/observer';
import {
  UsersIcon,
  SparklesIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';

export default function ObserverFeedPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [siteSettings, setSiteSettings] = useState(null);
  const retryCountRef = useRef(0);
  // Check both state (from navigate) and query param (from window.location.href redirect)
  const freshInvitation = location.state?.freshInvitation || searchParams.get('fresh') === '1';
  const wasFreshInvitationRef = useRef(freshInvitation); // Store in ref for retry logic

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
    // If coming from a fresh invitation, add initial delay to allow DB commit to complete
    if (freshInvitation) {
      console.log('[ObserverFeedPage] Fresh invitation detected, delaying initial fetch');
      const timer = setTimeout(() => {
        fetchMyStudents();
      }, 800); // Give DB time to commit the observer_student_link
      // Clear the freshInvitation indicators to prevent re-triggering on back navigation
      window.history.replaceState({}, document.title);
      // Also remove ?fresh=1 query param if present
      if (searchParams.get('fresh')) {
        searchParams.delete('fresh');
        setSearchParams(searchParams, { replace: true });
      }
      return () => clearTimeout(timer);
    } else {
      fetchMyStudents();
    }
  }, []);

  const fetchMyStudents = async (isRetry = false) => {
    try {
      if (!isRetry) setLoading(true);
      const response = await observerAPI.getMyStudents();
      const fetchedStudents = response.data.students || [];

      // If coming from fresh invitation and no students found, retry a few times
      // This handles race condition where DB write hasn't completed yet
      if (fetchedStudents.length === 0 && wasFreshInvitationRef.current && retryCountRef.current < 3) {
        retryCountRef.current += 1;
        console.log(`[ObserverFeedPage] No students found after fresh invitation, retry ${retryCountRef.current}/3`);
        setTimeout(() => fetchMyStudents(true), 800 * retryCountRef.current); // Progressive backoff
        return;
      }

      setStudents(fetchedStudents);
    } catch (error) {
      console.error('Failed to fetch students:', error);
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  // Use ref to track loading state to avoid stale closures
  const feedLoadingRef = useRef(false);

  const fetchFeed = useCallback(async (reset = false, studentIdOverride = undefined) => {
    // Use ref for loading check to avoid stale closure
    if (feedLoadingRef.current || (!hasMore && !reset)) return;

    feedLoadingRef.current = true;
    setFeedLoading(true);
    try {
      const params = {
        limit: 20,
        cursor: reset ? undefined : nextCursor
      };

      // Use override if provided, otherwise use state
      const studentId = studentIdOverride !== undefined ? studentIdOverride : selectedStudentId;
      if (studentId) {
        params.studentId = studentId;
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
      feedLoadingRef.current = false;
      setFeedLoading(false);
    }
  }, [selectedStudentId, hasMore, nextCursor]);

  // Reset feed when student filter changes
  useEffect(() => {
    setFeedItems([]);
    setNextCursor(null);
    setHasMore(true);
    // Pass the new studentId directly to avoid closure issues
    fetchFeed(true, selectedStudentId);
  }, [selectedStudentId]);

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
  }, [hasMore, feedLoading, fetchFeed]);

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
    const isObserverRole = user?.role === 'observer';
    return (
      <div className={`min-h-screen ${isObserverRole ? 'bg-gradient-to-br from-purple-50 via-white to-pink-50' : ''}`}>
        {/* Simple header for empty state - only for observer-role users */}
        {isObserverRole && (
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
        )}

        <div className={`flex items-center justify-center p-3 sm:p-4 ${isObserverRole ? 'mt-12 sm:mt-20' : 'mt-6 sm:mt-8'}`}>
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-5 sm:p-8 text-center">
            <UsersIcon className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">No Students Linked Yet</h2>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
              You haven't been linked to any students yet. Ask a parent to send you an invitation link so you can follow their child's learning journey.
            </p>
            <p className="text-xs sm:text-sm text-gray-500">
              Once connected, you'll see student activity and achievements here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const selectedStudent = students.find(s => s.student_id === selectedStudentId);

  const isObserverOnly = user?.role === 'observer';
  const isParent = user?.role === 'parent';
  // Show full-screen experience with own header for all users accessing this page
  // Observer-role users get observer-specific header; others get a simplified header with back link

  // Determine back link based on user role
  const getBackLink = () => {
    if (isParent) return '/parent/dashboard';
    if (user?.role === 'advisor') return '/dashboard';
    if (user?.role === 'superadmin') return '/admin';
    return '/dashboard';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - show for all users */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center gap-4">
              <Link to={isObserverOnly ? "/observer/feed" : getBackLink()} className="flex items-center">
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
                <h1 className="text-lg font-semibold text-gray-900">
                  {isParent ? 'Family Activity Feed' : 'Observer Feed'}
                </h1>
              </div>
            </div>

            {/* User Controls */}
            <div className="flex items-center gap-2 sm:gap-3">
              {isObserverOnly && (
                <Link
                  to="/observer/welcome"
                  className="text-optio-purple hover:text-optio-pink font-medium text-sm flex items-center gap-1"
                >
                  <SparklesIcon className="w-4 h-4" />
                  Tips
                </Link>
              )}

              <Link
                to={isObserverOnly ? "/dashboard" : getBackLink()}
                className="flex items-center gap-1 text-sm bg-gradient-to-r from-optio-purple to-optio-pink text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity font-medium"
              >
                <ArrowRightIcon className="w-4 h-4" />
                {isObserverOnly ? 'Access Platform' : 'Back to Dashboard'}
              </Link>

              {isObserverOnly && (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
                  title="Log out"
                >
                  <ArrowRightOnRectangleIcon className="w-5 h-5" />
                  <span className="hidden sm:inline">Log out</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Header with Student Filter Dropdown */}
        <div className="flex flex-col gap-3 mb-4 sm:mb-6">
          {/* Student Filter Dropdown - Full width on mobile, first on mobile for quick access */}
          <div className="relative order-first sm:order-last">
            <select
              value={selectedStudentId || ''}
              onChange={(e) => setSelectedStudentId(e.target.value || null)}
              className="appearance-none w-full bg-white border border-gray-300 rounded-lg pl-4 pr-10 py-3 text-base font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent cursor-pointer"
            >
              <option value="">All Students ({students.length})</option>
              {students.map(link => {
                const studentName = link.student?.display_name ||
                  `${link.student?.first_name || ''} ${link.student?.last_name || ''}`.trim() ||
                  'Student';
                return (
                  <option key={link.student_id} value={link.student_id}>
                    {studentName}
                  </option>
                );
              })}
            </select>
            <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
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
        </div>

        {/* Feed Items */}
        <div className="space-y-3 sm:space-y-4">
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
            <div className="bg-white rounded-lg shadow p-8 sm:p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-b-2 border-optio-purple mx-auto" />
              <p className="text-gray-500 mt-3 sm:mt-4 text-sm sm:text-base">Loading activity...</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6 sm:p-12 text-center">
              <SparklesIcon className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No Activity Yet</h3>
              <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
                {selectedStudentId
                  ? "This student hasn't completed any tasks yet. Check back soon!"
                  : "Your linked students haven't completed any tasks yet. Completed work will appear here."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
