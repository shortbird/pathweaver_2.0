import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

/**
 * Hook to fetch active subscription tiers for public display
 * Cached for 5 minutes to reduce API calls
 */
export const useSubscriptionTiers = () => {
  return useQuery({
    queryKey: ['subscription-tiers'],
    queryFn: async () => {
      const response = await api.get('/api/tiers')
      return response.data
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    refetchOnWindowFocus: false,
  })
}

/**
 * Admin hook to fetch ALL subscription tiers (including inactive)
 * For use in admin panel only
 */
export const useAdminSubscriptionTiers = () => {
  return useQuery({
    queryKey: ['admin-subscription-tiers'],
    queryFn: async () => {
      const response = await api.get('/api/v3/admin/tiers')
      return response.data
    },
    staleTime: 1 * 60 * 1000, // 1 min cache for admin
    refetchOnWindowFocus: true,
  })
}

/**
 * Admin hook to update a subscription tier
 */
export const useUpdateTier = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tierId, data }) => {
      const response = await api.put(`/api/v3/admin/tiers/${tierId}`, data)
      return response.data
    },
    onSuccess: () => {
      // Invalidate both admin and public caches
      queryClient.invalidateQueries(['admin-subscription-tiers'])
      queryClient.invalidateQueries(['subscription-tiers'])

      // Clear server-side cache
      api.post('/api/tiers/clear-cache', {}).catch(() => {})
    },
  })
}

/**
 * Admin hook to create a new subscription tier
 */
export const useCreateTier = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data) => {
      const response = await api.post('/api/v3/admin/tiers', data)
      return response.data
    },
    onSuccess: () => {
      // Invalidate both admin and public caches
      queryClient.invalidateQueries(['admin-subscription-tiers'])
      queryClient.invalidateQueries(['subscription-tiers'])

      // Clear server-side cache
      api.post('/api/tiers/clear-cache', {}).catch(() => {})
    },
  })
}

/**
 * Utility function to get tier by key
 */
export const getTierByKey = (tiers, tierKey) => {
  if (!tiers) return null
  return tiers.find(t => t.tier_key === tierKey)
}

/**
 * Utility function to format price
 */
export const formatPrice = (price) => {
  if (price === 0) return '$0'
  return `$${parseFloat(price).toFixed(2)}`
}

/**
 * Utility function to calculate yearly savings
 */
export const calculateYearlySavings = (monthlyPrice, yearlyPrice) => {
  const monthlyAnnual = monthlyPrice * 12
  const savings = monthlyAnnual - yearlyPrice
  const percentSaved = ((savings / monthlyAnnual) * 100).toFixed(0)
  return {
    amount: savings,
    percent: percentSaved,
    monthlyEquivalent: (yearlyPrice / 12).toFixed(2)
  }
}
