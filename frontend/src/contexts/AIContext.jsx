import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import api from '../services/api';

const AIContext = createContext(null);

/**
 * AI Assistance Levels:
 * - 'off': No AI suggestions anywhere
 * - 'suggestions': Show AI suggestions, user decides (default)
 * - 'auto': AI suggestions auto-applied where appropriate
 */
const AI_LEVELS = {
  OFF: 'off',
  SUGGESTIONS: 'suggestions',
  AUTO: 'auto'
};

export const AIProvider = ({ children }) => {
  const { user } = useAuth();
  const [aiLevel, setAiLevel] = useState(AI_LEVELS.SUGGESTIONS);
  const [isLoading, setIsLoading] = useState(true);

  // Feature-specific toggles (for users who want granular control)
  const [featureToggles, setFeatureToggles] = useState({
    titleSuggestions: true,
    pillarSuggestions: true,
    trackSuggestions: true,
    threadSuggestions: true,
    reflectionPrompts: true,
    weeklyDigest: true
  });

  // Load user's AI settings
  useEffect(() => {
    const loadSettings = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        // Get user's AI settings from their profile
        const response = await api.get('/api/auth/me');
        if (response.data?.user?.ai_assistance_level) {
          setAiLevel(response.data.user.ai_assistance_level);
        }
      } catch (error) {
        console.error('Failed to load AI settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [user]);

  // Save AI level to backend
  const updateAILevel = useCallback(async (newLevel) => {
    if (!user || !Object.values(AI_LEVELS).includes(newLevel)) return;

    const previousLevel = aiLevel;
    setAiLevel(newLevel);

    try {
      await api.put('/api/auth/ai-settings', {
        ai_assistance_level: newLevel
      });
    } catch (error) {
      console.error('Failed to save AI settings:', error);
      // Revert on error
      setAiLevel(previousLevel);
    }
  }, [user, aiLevel]);

  // Toggle a specific feature
  const toggleFeature = useCallback((featureName) => {
    setFeatureToggles(prev => ({
      ...prev,
      [featureName]: !prev[featureName]
    }));
  }, []);

  // Check if AI suggestions should be shown
  const shouldShowSuggestions = useCallback(() => {
    return aiLevel !== AI_LEVELS.OFF;
  }, [aiLevel]);

  // Check if AI should auto-apply
  const shouldAutoApply = useCallback(() => {
    return aiLevel === AI_LEVELS.AUTO;
  }, [aiLevel]);

  // Check if a specific feature is enabled
  const isFeatureEnabled = useCallback((featureName) => {
    if (aiLevel === AI_LEVELS.OFF) return false;
    return featureToggles[featureName] !== false;
  }, [aiLevel, featureToggles]);

  const value = {
    // Settings
    aiLevel,
    updateAILevel,
    isLoading,

    // Feature toggles
    featureToggles,
    toggleFeature,

    // Convenience methods
    shouldShowSuggestions,
    shouldAutoApply,
    isFeatureEnabled,

    // Constants
    AI_LEVELS
  };

  return (
    <AIContext.Provider value={value}>
      {children}
    </AIContext.Provider>
  );
};

export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};

export default AIContext;
