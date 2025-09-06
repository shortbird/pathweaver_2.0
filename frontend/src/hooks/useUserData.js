import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

export const useUserData = () => {
  const { user, loginTimestamp } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await api.get('/api/users/dashboard');
      setDashboardData(response.data);
      setError(null);
    } catch (error) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const refreshData = useCallback(() => {
    if (user?.id) {
      fetchDashboardData();
    }
  }, [user?.id, fetchDashboardData]);

  useEffect(() => {
    if (user?.id) {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [user?.id, loginTimestamp, fetchDashboardData]);

  // Refresh dashboard data every 30 seconds to reflect task completions
  useEffect(() => {
    if (!user?.id) return;
    
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [user?.id, fetchDashboardData]);
  
  // Listen for task completion events
  useEffect(() => {
    const handleTaskComplete = () => {
      // Refresh data when a task is completed
      fetchDashboardData();
    };
    
    // Listen for custom event that could be triggered from task completion
    window.addEventListener('taskCompleted', handleTaskComplete);
    window.addEventListener('questCompleted', handleTaskComplete);
    
    return () => {
      window.removeEventListener('taskCompleted', handleTaskComplete);
      window.removeEventListener('questCompleted', handleTaskComplete);
    };
  }, [fetchDashboardData]);

  return {
    dashboardData,
    loading,
    error,
    refreshData
  };
};