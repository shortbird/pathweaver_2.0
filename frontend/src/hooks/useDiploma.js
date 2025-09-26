import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { formatErrorMessage } from '../utils/errorMessages';

export const useDiploma = (slug, userId) => {
  const { user, loginTimestamp } = useAuth();
  const [achievements, setAchievements] = useState([]);
  const [totalXP, setTotalXP] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [diploma, setDiploma] = useState(null);
  const [error, setError] = useState(null);
  const [totalXPCount, setTotalXPCount] = useState(0);
  const [shareableLink, setShareableLink] = useState('');

  const fetchPublicDiploma = useCallback(async () => {
    try {
      const response = await api.get(`/api/portfolio/public/${slug}`);
      setDiploma(response.data);
    } catch (error) {
      const errorInfo = formatErrorMessage(
        error.response?.status === 404 ? 'diploma/not-found' : 'diploma/private'
      );
      setError(errorInfo);
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  const fetchPublicDiplomaByUserId = useCallback(async () => {
    try {
      const response = await api.get(`/api/portfolio/diploma/${userId}`);
      setDiploma(response.data);
    } catch (error) {
      const errorInfo = formatErrorMessage(
        error.response?.status === 404 ? 'diploma/not-found' : 'diploma/private'
      );
      setError(errorInfo);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const fetchAchievements = useCallback(async () => {
    try {
      // Fetch both completed quests and user XP data using api service with cookies
      const [questsResponse, dashboardResponse] = await Promise.all([
        api.get(`/api/v3/quests/completed?t=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-cache'
          }
        }).catch(error => ({ error, status: error.response?.status })),
        api.get(`/api/users/dashboard?t=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-cache'
          }
        }).catch(error => ({ error, status: error.response?.status }))
      ]);

      // Handle quests response
      if (questsResponse.error) {
        // If no achievements, that's okay - show empty state
        if (questsResponse.status === 404) {
          // Still try to get XP from dashboard
          if (!dashboardResponse.error) {
            const dashboardData = dashboardResponse.data;
            setTotalXP(dashboardData.xp_by_category || {});
            setTotalXPCount(dashboardData.stats?.total_xp || 0);
          } else {
            setTotalXP({});
            setTotalXPCount(0);
          }
          setAchievements([]);
          setIsLoading(false);
          return;
        }
        throw new Error('Failed to fetch achievements');
      }

      const questsData = questsResponse.data;
      const dashboardData = !dashboardResponse.error ? dashboardResponse.data : null;
      
      setAchievements(questsData.achievements || []);

      // Use XP from dashboard if available (most reliable source)
      if (dashboardData?.xp_by_category) {
        setTotalXP(dashboardData.xp_by_category);
        setTotalXPCount(dashboardData.stats?.total_xp || 0);
      } else {
        // Fallback: Calculate total XP by pillar from achievements
        const xpByPillar = {};
        let totalXPSum = 0;
        questsData.achievements?.forEach((achievement) => {
          Object.entries(achievement.task_evidence || {}).forEach(([taskName, evidence]) => {
            const pillar = evidence.pillar;
            if (pillar) {
              xpByPillar[pillar] = (xpByPillar[pillar] || 0) + evidence.xp_awarded;
              totalXPSum += evidence.xp_awarded;
            }
          });
        });
        setTotalXP(xpByPillar);
        setTotalXPCount(totalXPSum);
      }

    } catch (error) {
      // Don't show error for authenticated users, just show empty achievements
      setAchievements([]);
      setTotalXP({});
      setTotalXPCount(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const generateShareableLink = useCallback(() => {
    if (user?.id) {
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/diploma/${user.id}`;
      setShareableLink(link);
    }
  }, [user?.id]);

  const refreshData = useCallback(() => {
    setAchievements([]);
    setTotalXP({});
    setTotalXPCount(0);
    setIsLoading(true);
    setError(null);
    
    if (slug) {
      fetchPublicDiploma();
    } else if (userId) {
      fetchPublicDiplomaByUserId();
    } else if (user) {
      fetchAchievements();
      generateShareableLink();
    }
  }, [slug, userId, user, fetchPublicDiploma, fetchPublicDiplomaByUserId, fetchAchievements, generateShareableLink]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Refresh on login timestamp change
  useEffect(() => {
    if (loginTimestamp && user && !slug && !userId) {
      refreshData();
    }
  }, [loginTimestamp, user, slug, userId, refreshData]);

  // Auto-generate shareable link when user changes
  useEffect(() => {
    if (user && !slug && !userId) {
      generateShareableLink();
    }
  }, [user, slug, userId, generateShareableLink]);

  return {
    achievements,
    totalXP,
    totalXPCount,
    isLoading,
    diploma,
    error,
    shareableLink,
    refreshData
  };
};