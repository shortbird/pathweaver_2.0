import React, { useState, useEffect } from 'react';
import { getAuthHeaders } from '../services/api';

const QuestRating = ({ questId, onRatingSubmit }) => {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [userRating, setUserRating] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [questStats, setQuestStats] = useState(null);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    fetchUserRating();
    fetchQuestStats();
  }, [questId]);

  const fetchUserRating = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/quests/${questId}/user-rating`, {
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.user_rating) {
          setUserRating(data.user_rating);
          setRating(data.user_rating);
        }
      }
    } catch (error) {
      console.error('Error fetching user rating:', error);
    }
  };

  const fetchQuestStats = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/quests/${questId}/rating`);
      
      if (response.ok) {
        const data = await response.json();
        setQuestStats(data);
      }
    } catch (error) {
      console.error('Error fetching quest stats:', error);
    }
  };

  const handleRatingSubmit = async (selectedRating) => {
    setSubmitting(true);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/quests/${questId}/rate`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rating: selectedRating })
      });

      if (response.ok) {
        const data = await response.json();
        setUserRating(selectedRating);
        setRating(selectedRating);
        
        // Update stats
        if (data.average_rating !== undefined) {
          setQuestStats(prev => ({
            ...prev,
            average_rating: data.average_rating,
            total_ratings: data.total_ratings
          }));
        }
        
        onRatingSubmit?.(selectedRating);
      }
    } catch (error) {
      console.error('Error submitting rating:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStar = (starIndex) => {
    const filled = hoveredRating ? starIndex <= hoveredRating : starIndex <= rating;
    
    return (
      <button
        key={starIndex}
        onClick={() => handleRatingSubmit(starIndex)}
        onMouseEnter={() => setHoveredRating(starIndex)}
        onMouseLeave={() => setHoveredRating(0)}
        disabled={submitting}
        className={`transition-all transform hover:scale-110 ${submitting ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <svg
          className={`w-8 h-8 ${filled ? 'text-yellow-400' : 'text-gray-300'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      </button>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-900">Rate This Quest</h3>
        {questStats && (
          <button
            onClick={() => setShowStats(!showStats)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {showStats ? 'Hide' : 'Show'} Stats
          </button>
        )}
      </div>

      {showStats && questStats && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Average Rating:</span>
            <div className="flex items-center">
              <span className="font-semibold text-lg mr-1">{questStats.average_rating.toFixed(1)}</span>
              <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Based on {questStats.total_ratings} rating{questStats.total_ratings !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      <div className="flex justify-center space-x-1">
        {[1, 2, 3, 4, 5].map(renderStar)}
      </div>

      {userRating && (
        <p className="text-center text-sm text-gray-600 mt-3">
          You rated this quest {userRating} star{userRating !== 1 ? 's' : ''}
        </p>
      )}

      {submitting && (
        <p className="text-center text-sm text-gray-500 mt-2">Submitting...</p>
      )}
    </div>
  );
};

export default QuestRating;