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
      const response = await api.get(`/portfolio/public/${slug}`);
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
      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/portfolio/diploma/${userId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch diploma');
      }
      
      const data = await response.json();
      setDiploma(data);
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
      const apiBase = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('access_token');
      
      // Fetch both completed quests and user XP data
      const [questsResponse, dashboardResponse] = await Promise.all([
        fetch(`${apiBase}/api/v3/quests/completed?t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
          }
        }),
        fetch(`${apiBase}/api/users/dashboard?t=${Date.now()}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
          }
        })
      ]);

      if (!questsResponse.ok) {
        // If no achievements, that's okay - show empty state
        if (questsResponse.status === 404) {
          // Still try to get XP from dashboard
          if (dashboardResponse.ok) {
            const dashboardData = await dashboardResponse.json();
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

      const questsData = await questsResponse.json();
      const dashboardData = dashboardResponse.ok ? await dashboardResponse.json() : null;
      
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