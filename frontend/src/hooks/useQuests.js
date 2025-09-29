import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export const useQuests = (searchTerm = '', selectedPillar = 'all', initialPage = 1) => {
  const { user, loginTimestamp } = useAuth();
  const [quests, setQuests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(true);
  const [totalResults, setTotalResults] = useState(0);

  const fetchQuests = useCallback(async (isInitial = true) => {
    if (isInitial) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError('');

    try {
      const params = new URLSearchParams({
        page,
        per_page: 12,
        ...(searchTerm && { search: searchTerm }),
        ...(selectedPillar !== 'all' && { pillar: selectedPillar }),
        t: Date.now() // Cache-busting parameter
      });

      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/quests?${params}`, {
        credentials: user ? 'include' : 'omit', // Send cookies for authenticated users
        cache: 'no-cache' // Ensure fresh data
      });

      if (!response.ok) {
        throw new Error('Unable to load quests at this time. Please check your internet connection and try again.');
      }

      const data = await response.json();
      
      if (isInitial) {
        setQuests(data.quests || []);
      } else {
        setQuests(prev => [...prev, ...(data.quests || [])]);
      }
      
      setTotalResults(data.total || 0);
      setHasMore(data.has_more || (data.quests && data.quests.length === 12));
    } catch (error) {
      const errorMsg = error.response?.status === 500 
        ? 'Our servers are temporarily unavailable. Please try again in a few moments.'
        : error.response?.status === 404
        ? 'No quests found. Check back later for new adventures!'
        : 'Unable to load quests at this time. Please check your connection and refresh the page.'
      setError(errorMsg);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [page, searchTerm, selectedPillar, user]);

  // Reset when filters change
  const resetQuests = useCallback(() => {
    setQuests([]);
    setPage(1);
    setHasMore(true);
  }, []);

  // Load more quests for infinite scroll
  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      setPage(prevPage => prevPage + 1);
    }
  }, [isLoadingMore, hasMore]);

  // Refresh quests (useful for navigation back, focus events)
  const refreshQuests = useCallback(() => {
    resetQuests();
    fetchQuests(true);
  }, [resetQuests, fetchQuests]);

  // Auto-fetch when dependencies change
  useEffect(() => {
    resetQuests();
  }, [searchTerm, selectedPillar, resetQuests]);

  useEffect(() => {
    if (page === 1) {
      fetchQuests(true);
    } else {
      fetchQuests(false);
    }
  }, [page, fetchQuests]);

  // Refresh on login change
  useEffect(() => {
    if (loginTimestamp) {
      refreshQuests();
    }
  }, [loginTimestamp, refreshQuests]);

  return {
    quests,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    totalResults,
    loadMore,
    refreshQuests,
    resetQuests
  };
};