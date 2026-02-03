import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { observerAPI } from '../services/api';
import FeedCard from '../components/observer/FeedCard';
import {
  SparklesIcon,
  ArrowRightIcon,
  HeartIcon
} from '@heroicons/react/24/outline';

export default function StudentFeedbackPage() {
  const { user } = useAuth();
  const [feedItems, setFeedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.id) {
      fetchActivityFeed();
    }
  }, [user?.id]);

  const fetchActivityFeed = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await observerAPI.getMyActivityFeed(user.id);
      setFeedItems(response.data.items || []);
    } catch (err) {
      console.error('Failed to fetch activity feed:', err);
      setError('Failed to load your activity. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Activity</h1>
        <p className="text-gray-600">
          See your completed work and feedback from your observers.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {feedItems.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <SparklesIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Activity Yet</h2>
          <p className="text-gray-600 max-w-md mx-auto mb-6">
            Complete some tasks to see your activity here. When observers leave comments
            or likes, you'll see them too!
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-optio-purple hover:text-optio-pink font-medium"
          >
            Go to Dashboard
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {feedItems.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              showStudentName={false}
              isStudentView={true}
            />
          ))}
        </div>
      )}

      {/* Encouragement Note */}
      {feedItems.length > 0 && (
        <div className="mt-8 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100">
          <div className="flex items-start gap-4">
            <HeartIcon className="w-6 h-6 text-optio-purple shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">
                Keep up the great work!
              </h3>
              <p className="text-gray-600 text-sm">
                Your observers can see your progress and leave encouraging comments.
                Remember: the process is the goal.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
