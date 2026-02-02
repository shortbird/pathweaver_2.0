import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import LearningEventCard from '../components/learning-events/LearningEventCard';
import ParentMomentCaptureButton from '../components/parent/ParentMomentCaptureButton';
import {
  ArrowLeftIcon,
  SparklesIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

/**
 * ParentChildJournalPage - Parent view of child's learning journal
 * Allows viewing all moments and capturing new ones
 */
const ParentChildJournalPage = () => {
  const { childId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [childInfo, setChildInfo] = useState(null);
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!childId) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch child info and moments in parallel
      const [childResponse, momentsResponse] = await Promise.all([
        api.get(`/api/parent/child-overview/${childId}`),
        api.get(`/api/parent/children/${childId}/learning-moments?limit=50`)
      ]);

      if (childResponse.data?.student) {
        setChildInfo(childResponse.data.student);
      }

      setMoments(momentsResponse.data.moments || []);
    } catch (err) {
      console.error('Failed to fetch journal data:', err);
      setError(err.response?.data?.error || 'Failed to load journal');
      toast.error('Failed to load learning journal');
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleMomentCaptured = () => {
    // Refresh moments after capturing a new one
    fetchData();
  };

  const childName = childInfo?.first_name || childInfo?.display_name || 'Child';

  // Build child data for capture button
  const childForCapture = childInfo ? [{
    id: childId,
    name: `${childInfo.first_name || ''} ${childInfo.last_name || ''}`.trim() || childInfo.display_name || 'Child'
  }] : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="h-32 bg-gray-200 rounded-xl" />
            <div className="h-32 bg-gray-200 rounded-xl" />
            <div className="h-32 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/parent')}
            className="px-4 py-2 bg-optio-purple text-white rounded-lg"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/parent')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Back to dashboard"
              >
                <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  {childName}'s Learning Journal
                </h1>
                <p className="text-sm text-gray-500">
                  {moments.length} {moments.length === 1 ? 'moment' : 'moments'} captured
                </p>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Refresh"
            >
              <ArrowPathIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {moments.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-lg">
            <SparklesIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
              No Learning Moments Yet
            </h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Start capturing {childName}'s learning moments using the button in the bottom right corner.
              These could be anything - a question they asked, something they built, or a skill they practiced.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Info banner */}
            <div className="bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
                <strong>Tip:</strong> Capture learning moments as they happen - a curious question, a creative project,
                or a new skill practiced. These moments become part of {childName}'s learning story.
              </p>
            </div>

            {/* Moments list */}
            {moments.map((moment) => (
              <div key={moment.id} className="relative">
                <LearningEventCard
                  event={moment}
                  onUpdate={fetchData}
                />
                {/* Parent-captured indicator */}
                {moment.captured_by_user_id === user?.id && (
                  <div className="absolute top-4 right-4">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-optio-purple/10 text-optio-purple text-xs font-medium rounded-full">
                      <SparklesIcon className="w-3 h-3" />
                      You captured
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Capture Button */}
      <ParentMomentCaptureButton
        children={[]}
        dependents={childForCapture.map(c => ({ id: c.id, display_name: c.name }))}
        selectedChildId={childId}
        onSuccess={handleMomentCaptured}
      />
    </div>
  );
};

export default ParentChildJournalPage;
