/**
 * React Query hooks for Calendar feature
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'

/**
 * Fetch all calendar items for a user
 */
export const useCalendar = (userId, options = {}) => {
  return useQuery({
    queryKey: ['calendar', userId],
    queryFn: async () => {
      if (!userId) return null
      const response = await api.get('/api/calendar')
      return response.data
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
    ...options
  })
}

/**
 * Fetch "What Do I Do Next?" prioritized items
 */
export const useNextUp = (userId, options = {}) => {
  return useQuery({
    queryKey: ['calendar', 'next-up', userId],
    queryFn: async () => {
      if (!userId) return null
      const response = await api.get('/api/calendar/next-up')
      return response.data
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
    ...options
  })
}

/**
 * Fetch user's calendar preferences
 */
export const useCalendarPreferences = (userId, options = {}) => {
  return useQuery({
    queryKey: ['calendar', 'preferences', userId],
    queryFn: async () => {
      if (!userId) return null
      const response = await api.get('/api/calendar/preferences')
      return response.data
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes (preferences change rarely)
    ...options
  })
}

/**
 * Update a single deadline
 */
export const useUpdateDeadline = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, questId, taskId, scheduledDate }) => {
      const response = await api.put('/api/calendar/deadline', {
        user_id: userId,
        quest_id: questId,
        task_id: taskId,
        scheduled_date: scheduledDate
      })
      return response.data
    },
    onSuccess: (data, variables) => {
      // Invalidate calendar queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['calendar', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['calendar', 'next-up', variables.userId] })
    }
  })
}

/**
 * Bulk update multiple deadlines
 */
export const useBulkUpdateDeadlines = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, items }) => {
      const response = await api.put('/api/calendar/bulk-deadline', {
        user_id: userId,
        items
      })
      return response.data
    },
    onSuccess: (data, variables) => {
      // Invalidate calendar queries
      queryClient.invalidateQueries({ queryKey: ['calendar', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['calendar', 'next-up', variables.userId] })
    }
  })
}

/**
 * Update user's calendar preferences
 */
export const useUpdatePreferences = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, viewMode, defaultPillarFilter }) => {
      const response = await api.put('/api/calendar/preferences', {
        view_mode: viewMode,
        default_pillar_filter: defaultPillarFilter
      })
      return response.data
    },
    onSuccess: (data, variables) => {
      // Update preferences cache
      queryClient.setQueryData(['calendar', 'preferences', variables.userId], data.preferences)
    }
  })
}

/**
 * Helper hook to get task status with color coding
 */
export const useTaskStatus = (task) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (task.status === 'completed') {
    return {
      status: 'completed',
      label: 'Completed',
      color: 'green',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      borderColor: 'border-green-300'
    }
  }

  if (!task.scheduled_date) {
    return {
      status: 'exploring',
      label: 'Exploring',
      color: 'gray',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-800',
      borderColor: 'border-gray-300'
    }
  }

  const scheduledDate = new Date(task.scheduled_date)
  scheduledDate.setHours(0, 0, 0, 0)

  if (task.status === 'wandering') {
    return {
      status: 'wandering',
      label: 'Ready for a pivot',
      color: 'yellow',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-800',
      borderColor: 'border-yellow-300'
    }
  }

  if (scheduledDate.getTime() === today.getTime()) {
    return {
      status: 'today',
      label: 'Today',
      color: 'blue',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-800',
      borderColor: 'border-blue-300'
    }
  }

  return {
    status: 'on-track',
    label: 'On track',
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
    borderColor: 'border-blue-300'
  }
}

/**
 * Helper to get pillar color
 */
export const getPillarColor = (pillar) => {
  const colors = {
    'STEM & Logic': {
      bg: 'bg-purple-100',
      text: 'text-purple-800',
      border: 'border-purple-300',
      hex: '#9333EA'
    },
    'Life & Wellness': {
      bg: 'bg-green-100',
      text: 'text-green-800',
      border: 'border-green-300',
      hex: '#16A34A'
    },
    'Language & Communication': {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      border: 'border-blue-300',
      hex: '#2563EB'
    },
    'Society & Culture': {
      bg: 'bg-orange-100',
      text: 'text-orange-800',
      border: 'border-orange-300',
      hex: '#EA580C'
    },
    'Arts & Creativity': {
      bg: 'bg-pink-100',
      text: 'text-pink-800',
      border: 'border-pink-300',
      hex: '#DB2777'
    }
  }

  return colors[pillar] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-300',
    hex: '#6B7280'
  }
}
