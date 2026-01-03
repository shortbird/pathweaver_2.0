import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuth } from './AuthContext'
import logger from '../utils/logger'

const AIAccessContext = createContext()

export const useAIAccess = () => {
  const context = useContext(AIAccessContext)
  if (!context) {
    throw new Error('useAIAccess must be used within an AIAccessProvider')
  }
  return context
}

export const AIAccessProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth()
  const queryClient = useQueryClient()

  // Query AI access status when user is authenticated
  const {
    data: aiAccessData,
    isLoading: aiAccessLoading,
    error: aiAccessError,
    refetch: refetchAIAccess
  } = useQuery({
    queryKey: ['ai-access', 'status', user?.id],
    queryFn: async () => {
      const response = await api.get('/api/ai-access/status')
      return response.data
    },
    enabled: !!user && !authLoading,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    cacheTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    retry: 1,
    onError: (error) => {
      logger.error('Failed to fetch AI access status:', error)
    }
  })

  // Derived state with defaults
  const hasAccess = aiAccessData?.has_access ?? true
  const features = aiAccessData?.features ?? {
    chatbot: true,
    lesson_helper: true,
    task_generation: true
  }
  const orgLimits = aiAccessData?.org_limits ?? {
    chatbot: true,
    lesson_helper: true,
    task_generation: true
  }
  const reason = aiAccessData?.reason ?? null
  const code = aiAccessData?.code ?? null

  // Loading state: true until we have data or error
  const loading = authLoading || (!!user && aiAccessLoading)

  // Helper functions for checking specific features
  const canUseChatbot = hasAccess && features.chatbot
  const canUseLessonHelper = hasAccess && features.lesson_helper
  const canUseTaskGeneration = hasAccess && features.task_generation

  // Force refresh AI access status (call after parent/org toggles AI settings)
  const refreshAIAccess = useCallback(() => {
    queryClient.invalidateQueries(['ai-access', 'status'])
    refetchAIAccess()
  }, [queryClient, refetchAIAccess])

  // Refresh AI access when user changes
  useEffect(() => {
    if (user?.id) {
      refetchAIAccess()
    }
  }, [user?.id, refetchAIAccess])

  const value = {
    // Master toggle
    hasAccess,
    loading,
    reason,
    code,

    // Granular features
    features,
    orgLimits,

    // Convenience helpers
    canUseChatbot,
    canUseLessonHelper,
    canUseTaskGeneration,

    // Actions
    refreshAIAccess
  }

  return (
    <AIAccessContext.Provider value={value}>
      {children}
    </AIAccessContext.Provider>
  )
}

export default AIAccessContext
