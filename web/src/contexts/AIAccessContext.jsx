import React, { createContext, useContext, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuth } from './AuthContext'
import { useFamilyScope } from './FamilyScopeContext'
import logger from '../utils/logger'

const AIAccessContext = createContext()

const ALL_ON = { chatbot: true, lesson_helper: true, task_generation: true }
const ALL_OFF = { chatbot: false, lesson_helper: false, task_generation: false }

/** The status payload as the flags a component reads. */
export function deriveAIAccess(data, { fallback = ALL_ON } = {}) {
  const hasAccess = data?.has_access ?? (fallback === ALL_ON)
  const features = data?.features ?? fallback
  const orgLimits = data?.org_limits ?? ALL_ON
  return {
    hasAccess,
    features,
    orgLimits,
    reason: data?.reason ?? null,
    code: data?.code ?? null,
    canUseChatbot: hasAccess && !!features.chatbot,
    canUseLessonHelper: hasAccess && !!features.lesson_helper,
    canUseTaskGeneration: hasAccess && !!features.task_generation,
  }
}

/**
 * AI access for whoever the screen is about.
 *
 * Unscoped, that is the signed-in user (the provider's answer). When a parent
 * has picked a child in the family switcher, every AI call the page makes is
 * sent with that child's `student_id` and the backend checks the CHILD's
 * switches -- so the gate has to read the child's switches too. Before this a
 * parent saw "Generate tasks" for a child whose AI was off and got a 403
 * ai_disabled (Sentry 64448412 / e7429a56).
 *
 * The provider sits outside FamilyScopeProvider in App.jsx, so the child's
 * status is fetched here; React Query shares the one request between every
 * component that asks. While it loads the AI buttons stay hidden: showing
 * them and refusing is the bug this fixes.
 */
export const useAIAccess = () => {
  const context = useContext(AIAccessContext)
  if (!context) {
    throw new Error('useAIAccess must be used within an AIAccessProvider')
  }
  const { selectedChildId } = useFamilyScope()
  const { data: childData, isLoading: childLoading } = useQuery({
    queryKey: ['ai-access', 'status', 'child', selectedChildId],
    queryFn: async () => {
      const response = await api.get('/api/ai-access/status', {
        params: { student_id: selectedChildId },
      })
      return response.data
    },
    enabled: !!selectedChildId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
  return useMemo(() => {
    if (!selectedChildId) return context
    return {
      ...context,
      ...deriveAIAccess(childData, { fallback: ALL_OFF }),
      loading: childLoading,
    }
  }, [context, selectedChildId, childData, childLoading])
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
  const {
    hasAccess, features, orgLimits, reason, code,
    canUseChatbot, canUseLessonHelper, canUseTaskGeneration,
  } = deriveAIAccess(aiAccessData)

  // Loading state: true until we have data or error
  const loading = authLoading || (!!user && aiAccessLoading)

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
