import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'
import toast from 'react-hot-toast'

/**
 * Hook for fetching user portfolio/diploma data
 */
export const usePortfolio = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.portfolio.user(userId),
    queryFn: async () => {
      const response = await api.get(`/api/portfolio/user/${userId}`)
      return response.data
    },
    enabled: !!userId,
    ...options,
  })
}

/**
 * Hook for fetching public portfolio by slug
 */
export const usePublicPortfolio = (slug, options = {}) => {
  return useQuery({
    queryKey: queryKeys.portfolio.public(slug),
    queryFn: async () => {
      const response = await api.get(`/api/portfolio/${slug}`)
      return response.data
    },
    enabled: !!slug,
    ...options,
  })
}

/**
 * Hook for fetching portfolio settings
 */
export const usePortfolioSettings = (userId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.portfolio.settings(userId),
    queryFn: async () => {
      const response = await api.get(`/api/portfolio/${userId}/settings`)
      return response.data
    },
    enabled: !!userId,
    ...options,
  })
}

/**
 * Hook for updating portfolio settings
 */
export const useUpdatePortfolioSettings = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, settings }) => {
      const response = await api.put(`/api/portfolio/${userId}/settings`, settings)
      return response.data
    },
    onSuccess: (data, variables) => {
      // Update cached settings
      queryClient.setQueryData(
        queryKeys.portfolio.settings(variables.userId),
        data
      )

      // Invalidate portfolio data to reflect changes
      queryClient.invalidateQueries(queryKeys.portfolio.user(variables.userId))

      toast.success('Portfolio settings updated!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update portfolio settings')
    },
  })
}

/**
 * Hook for getting diploma data specifically
 */
export const useDiploma = (userId, options = {}) => {
  return useQuery({
    queryKey: [...queryKeys.portfolio.user(userId), 'diploma'],
    queryFn: async () => {
      const response = await api.get(`/api/portfolio/diploma/${userId}`)
      return response.data
    },
    enabled: !!userId,
    ...options,
  })
}