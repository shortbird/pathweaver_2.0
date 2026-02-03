import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronDownIcon,
  LightBulbIcon,
  SparklesIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import api from '../../services/api';

const SparkSelector = ({
  value,
  onChange,
  excludeMomentId = null,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [recentMoments, setRecentMoments] = useState([]);
  const [suggestedMoments, setSuggestedMoments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      fetchRecentMoments();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchRecentMoments = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/learning-events', {
        params: { limit: 10 }
      });
      if (response.data.success) {
        // Filter out the current moment if specified
        const moments = response.data.events.filter(
          m => m.id !== excludeMomentId
        );
        setRecentMoments(moments);
      }
    } catch (error) {
      console.error('Failed to fetch recent moments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSuggestions = async (momentId) => {
    if (!momentId) return;

    try {
      setIsLoadingSuggestions(true);
      const response = await api.post(`/api/learning-events/${momentId}/find-related`, {});
      if (response.data.success) {
        setSuggestedMoments(response.data.related_moments || []);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleSelect = (momentId) => {
    onChange(momentId);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null);
  };

  const selectedMoment = recentMoments.find(m => m.id === value);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Main Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between gap-2 px-3 py-2
          border border-gray-200 rounded-lg bg-white
          hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-optio-purple
          transition-colors text-left
        `}
      >
        {selectedMoment ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <LightBulbIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm text-gray-900 truncate">
              {selectedMoment.title || selectedMoment.description?.slice(0, 50) + '...'}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <span className="text-sm text-gray-500 flex items-center gap-2">
            <LightBulbIcon className="w-4 h-4" />
            What sparked this? (optional)
          </span>
        )}
        <ChevronDownIcon className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-gray-500">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-optio-purple rounded-full animate-spin mx-auto mb-2" />
              Loading moments...
            </div>
          ) : (
            <>
              {/* No spark option */}
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-left
                  hover:bg-gray-50 transition-colors border-b border-gray-100
                  ${value === null ? 'bg-gray-100' : ''}
                `}
              >
                <XMarkIcon className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">No spark (standalone moment)</span>
              </button>

              {/* AI Suggested section */}
              {suggestedMoments.length > 0 && (
                <div className="border-b border-gray-100">
                  <div className="px-3 py-1.5 bg-purple-50 flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3 text-purple-600" />
                    <span className="text-xs font-medium text-purple-700">AI Suggested</span>
                  </div>
                  {suggestedMoments.slice(0, 3).map(moment => (
                    <button
                      key={moment.id}
                      type="button"
                      onClick={() => handleSelect(moment.id)}
                      className={`
                        w-full flex items-start gap-2 px-3 py-2 text-left
                        hover:bg-purple-50 transition-colors
                        ${value === moment.id ? 'bg-purple-100' : ''}
                      `}
                    >
                      <LightBulbIcon className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {moment.title || 'Untitled'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {moment.description?.slice(0, 60)}...
                        </p>
                        {moment.relationship_reason && (
                          <p className="text-xs text-purple-600 italic mt-1">
                            {moment.relationship_reason}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Recent moments */}
              <div>
                <div className="px-3 py-1.5 bg-gray-50">
                  <span className="text-xs font-medium text-gray-500">Recent Moments</span>
                </div>
                {recentMoments.length > 0 ? (
                  recentMoments.map(moment => (
                    <button
                      key={moment.id}
                      type="button"
                      onClick={() => handleSelect(moment.id)}
                      className={`
                        w-full flex items-start gap-2 px-3 py-2 text-left
                        hover:bg-gray-50 transition-colors
                        ${value === moment.id ? 'bg-gray-100' : ''}
                      `}
                    >
                      <LightBulbIcon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {moment.title || 'Untitled'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {moment.description?.slice(0, 60)}...
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(moment.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-center text-sm text-gray-500">
                    No previous moments yet
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SparkSelector;
