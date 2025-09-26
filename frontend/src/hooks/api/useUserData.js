import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { queryKeys, mutationKeys } from '../../utils/queryKeys'
import toast from 'react-hot-toast'

/**
 * Hook for fetching user dashboard data
 */
export const useUserDashboard = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.user.dashboard(userId),
    queryFn: async () => {
      const response = await api.get('/api/users/dashboard')
      return response.data
    },
    enabled: !!userId,
    ...options,
  })
}

/**
 * Hook for fetching user profile data
 */
export const useUserProfile = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.user.profile(userId),
    queryFn: async () => {
      const response = await api.get(`/api/users/${userId}/profile`)
      return response.data
    },
    enabled: !!userId,
    ...options,
  })
}

/**
 * Hook for updating user profile
 */
export const useUpdateProfile = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.updateProfile],
    mutationFn: async ({ userId, profileData }) => {
      const response = await api.put(`/api/users/${userId}/profile`, profileData)
      return response.data
    },
    onSuccess: (data, variables) => {
      // Update cached profile data
      queryClient.setQueryData(
        queryKeys.user.profile(variables.userId),
        data
      )

      // Invalidate related queries
      queryKeys.invalidateUser(queryClient, variables.userId)

      toast.success('Profile updated successfully!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update profile')
    },
  })
}

/**
 * Hook for fetching user settings
 */
export const useUserSettings = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.user.settings(userId),
    queryFn: async () => {
      const response = await api.get(`/api/users/${userId}/settings`)
      return response.data
    },
    enabled: !!userId,
    ...options,
  })
}

/**
 * Hook for updating user settings
 */
export const useUpdateSettings = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.updateSettings],
    mutationFn: async ({ userId, settings }) => {
      const response = await api.put(`/api/users/${userId}/settings`, settings)
      return response.data
    },
    onSuccess: (data, variables) => {
      // Update cached settings
      queryClient.setQueryData(
        queryKeys.user.settings(variables.userId),
        data
      )

      toast.success('Settings updated successfully!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update settings')
    },
  })
}

/**
 * Hook for refreshing all user data
 */
export const useRefreshUserData = () => {
  const queryClient = useQueryClient()

  return (userId) => {
    if (userId) {
      queryKeys.invalidateUser(queryClient, userId)
    }
  }
}