import { useState, useEffect, useCallback } from 'react';
import { observerAPI } from '../../services/api';
import FeedCard from '../observer/FeedCard';

const AdvisorActivityFeed = () => {
  const [feedItems, setFeedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);

  const fetchFeed = useCallback(async (nextCursor = null) => {
    try {
      if (nextCursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      const params = { limit: 10 };
      if (nextCursor) params.cursor = nextCursor;

      const response = await observerAPI.getFeed(params);
      const data = response.data;

      if (nextCursor) {
        setFeedItems(prev => [...prev, ...(data.items || [])]);
      } else {
        setFeedItems(data.items || []);
      }
      setCursor(data.next_cursor || null);
      setHasMore(data.has_more || false);
      setError(null);
    } catch (err) {
      console.error('Error fetching activity feed:', err);
      if (!nextCursor) {
        setError('Failed to load activity feed');
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h3>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 bg-gray-200 rounded-full" />
                <div className="h-4 bg-gray-200 rounded w-32" />
              </div>
              <div className="h-3 bg-gray-200 rounded w-full mb-1" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h3>
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={() => fetchFeed()}
          className="mt-2 text-sm text-optio-purple hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h3>

      {feedItems.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">
          No recent activity from your students yet.
        </p>
      ) : (
        <div className="space-y-4">
          {feedItems.map((item, idx) => (
            <FeedCard
              key={`${item.completion_id || item.learning_event_id || 'item'}-${idx}`}
              item={item}
              showStudentName={true}
            />
          ))}

          {hasMore && (
            <button
              onClick={() => fetchFeed(cursor)}
              disabled={loadingMore}
              className="w-full py-2 text-sm text-optio-purple hover:text-optio-pink font-medium transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvisorActivityFeed;
