import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { observerAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { FeedCard } from '../components/observer';
import {
  UsersIcon,
  SparklesIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';

export default function ObserverFeedPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const retryCountRef = useRef(0);
  // Check both state (from navigate) and query param (from window.location.href redirect)
  const freshInvitation = location.state?.freshInvitation || searchParams.get('fresh') === '1';
  const wasFreshInvitationRef = useRef(freshInvitation); // Store in ref for retry logic
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

      // Fetch feed immediately after students are loaded
      // This ensures the feed loads on initial page load without waiting for selectedStudentId change
      if (fetchedStudents.length > 0) {
        setFeedItems([]);
        setNextCursor(null);
        setHasMore(true);
        // Small delay to ensure state updates are processed
        setTimeout(() => {
          fetchFeedDirect(null); // null = all students
        }, 50);
      }
    } catch (error) {
      console.error('Failed to fetch students:', error);
      // Don't show error toast if this is a fresh invitation - we'll retry
      if (!wasFreshInvitationRef.current || retryCountRef.current >= 3) {
        toast.error('Failed to load students');
      }
    } finally {
      setLoading(false);
    }
  };

  // Use ref to track loading state to avoid stale closures
  const feedLoadingRef = useRef(false);

  // Direct feed fetch function that doesn't rely on useCallback closures
  // Used for initial load after students are fetched
  const fetchFeedDirect = async (studentId) => {
    if (feedLoadingRef.current) return;

    feedLoadingRef.current = true;
    setFeedLoading(true);
    try {
      const params = { limit: 20 };
      if (studentId) {
        params.studentId = studentId;
      }

      const response = await observerAPI.getFeed(params);
      const newItems = response.data.items || [];

      setFeedItems(newItems);
      setHasMore(response.data.has_more);
      setNextCursor(response.data.next_cursor);

      // Record views for loaded items
      if (newItems.length > 0) {
        observerAPI.recordViews(newItems.map(i => ({ type: i.type, id: i.id }))).catch(() => {});
      }
    } catch (error) {
      console.error('Failed to fetch feed:', error);
      toast.error('Failed to load feed');
    } finally {
      feedLoadingRef.current = false;
      setFeedLoading(false);
    }
  };

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

      // Record views for loaded items
      if (newItems.length > 0) {
        observerAPI.recordViews(newItems.map(i => ({ type: i.type, id: i.id }))).catch(() => {});
      }
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

  // Track if this is the initial mount to avoid double-fetching
  const isInitialMountRef = useRef(true);

  // Reset feed when student filter changes (skip initial mount - handled by fetchMyStudents)
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 mt-8 sm:mt-16">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-5 sm:p-8 text-center">
          <UsersIcon className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">No Students Linked Yet</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
            You haven't been linked to any students yet. Ask a student or their parent to share an observer invitation link with you so you can follow their learning journey.
          </p>
          <p className="text-xs sm:text-sm text-gray-500">
            Once connected, you'll see student activity and achievements here.
          </p>
        </div>
      </div>
    );
  }

  const selectedStudent = students.find(s => s.student_id === selectedStudentId);

  const isParent = user?.role === 'parent';

  return (
    <div className="bg-gray-50 min-h-0">
      <div className="max-w-3xl mx-auto px-0 sm:px-6 py-4 sm:py-6">
        {/* Header with Student Filter Dropdown */}
        <div className="flex flex-col gap-3 mb-4 sm:mb-6 px-4 sm:px-0">
          {/* Student Filter Dropdown - Full width on mobile, first on mobile for quick access */}
          <div className="relative order-first sm:order-last">
            <select
              value={selectedStudentId || ''}
              onChange={(e) => setSelectedStudentId(e.target.value || null)}
              className="appearance-none w-full bg-white border border-gray-300 rounded-lg pl-4 pr-10 py-3 text-base font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent cursor-pointer"
            >
              <option value="">All Students ({students.length})</option>
              {students.map(link => {
                const studentName = `${link.student?.first_name || ''} ${link.student?.last_name || ''}`.trim() ||
                  link.student?.display_name ||
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
                ? `${`${selectedStudent?.student?.first_name || ''} ${selectedStudent?.student?.last_name || ''}`.trim() || selectedStudent?.student?.display_name || 'Student'}'s Activity`
                : 'Recent Activity'}
            </h2>
            <p className="text-sm text-gray-500">
              {selectedStudentId
                ? 'Tasks completed and learning moments captured'
                : `Activity from all ${students.length} linked students`}
            </p>
          </div>
        </div>

        {/* Feed Items */}
        <div className="space-y-3 sm:space-y-5">
          {feedItems.length > 0 ? (
            <>
              {feedItems.map(item => (
                <FeedCard
                  key={item.id}
                  item={item}
                  showStudentName={true}
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
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 sm:p-12 text-center mx-2 sm:mx-0">
              <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-b-2 border-optio-purple mx-auto" />
              <p className="text-gray-500 mt-3 sm:mt-4 text-sm sm:text-base">Loading activity...</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-12 text-center mx-2 sm:mx-0">
              <SparklesIcon className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">No Activity Yet</h3>
              <p className="text-sm sm:text-base text-gray-600 max-w-md mx-auto">
                {selectedStudentId
                  ? "This student hasn't completed any tasks or captured learning moments yet. Check back soon!"
                  : "Your linked students haven't completed any tasks or captured learning moments yet. Activity will appear here."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
