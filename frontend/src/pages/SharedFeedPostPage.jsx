import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { FeedCard } from '../components/observer';
import { LockClosedIcon } from '@heroicons/react/24/outline';

export default function SharedFeedPostPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPost = async () => {
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
  }, [token]);

  if (loading) {
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

  // Access denied -- non-observer
  if (data?.access === 'denied') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-md mx-auto px-4 pt-20 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <LockClosedIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Observer Access Required</h2>
            <p className="text-gray-600 mb-4">{data.message}</p>
            <p className="text-gray-500 text-sm mb-6">Already have an account? <Link to="/login" className="text-purple-600 hover:text-purple-700 font-medium">Log in</Link> to view this post.</p>
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
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center">
          <img
            src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg"
            alt="Optio"
            className="h-8 w-8 mr-2"
          />
          <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
            Optio
          </span>
        </Link>
        <Link
          to="/login"
          className="text-sm text-gray-600 hover:text-gray-900 font-medium"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
