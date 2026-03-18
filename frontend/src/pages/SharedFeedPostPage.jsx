import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { FeedCard } from '../components/observer';
import { LockClosedIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function SharedFeedPostPage() {
  const { token } = useParams();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch (or re-fetch) whenever auth state changes
  useEffect(() => {
    if (authLoading) return;

    const fetchPost = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/api/public/feed/${token}`);
        setData(response.data);
      } catch (err) {
        if (err.response?.status === 404) {
          setError('This share link is no longer available.');
        } else {
          setError('Something went wrong loading this post.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchPost();
  }, [token, isAuthenticated, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-md mx-auto px-4 pt-20 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <LockClosedIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Link Unavailable</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link
              to="/"
              className="text-purple-600 hover:text-purple-700 font-medium text-sm"
            >
              Learn about Optio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Access denied -- not logged in
  if (data?.access === 'denied' && !data?.logged_in) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-md mx-auto px-4 pt-20 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <LockClosedIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Log In to View</h2>
            <p className="text-gray-600 mb-6">You need to be logged in as an approved observer to view this post.</p>
            <Link
              to="/login"
              state={{ from: `/shared/feed/${token}` }}
              className="inline-block px-6 py-2 text-sm font-medium rounded-lg text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 transition-all"
            >
              Log in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Access denied -- logged in but not an approved observer
  if (data?.access === 'denied' && data?.logged_in) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-md mx-auto px-4 pt-20 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <LockClosedIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Observer Access Required</h2>
            <p className="text-gray-600 mb-6">You need to be an approved observer for this student to view their posts. Contact their parent about getting observer access.</p>
            <Link
              to="/"
              className="text-purple-600 hover:text-purple-700 font-medium text-sm"
            >
              Learn about Optio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Access granted -- show the feed item
  const item = data?.item;
  if (!item) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <FeedCard
          item={item}
          showStudentName={true}
          isStudentView={true}
        />
        <p className="text-center text-gray-400 text-xs mt-6">
          Shared from <Link to="/" className="text-purple-500 hover:text-purple-600">Optio</Link>
        </p>
      </div>
    </div>
  );
}

function Header() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center">
          <img
            src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
            alt="Optio"
            className="h-8 w-auto"
          />
        </Link>
        {isAuthenticated ? (
          <Link
            to="/observer/feed"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Feed
          </Link>
        ) : (
          <Link
            to="/login"
            className="text-sm text-gray-600 hover:text-gray-900 font-medium"
          >
            Log in
          </Link>
        )}
      </div>
    </div>
  );
}
