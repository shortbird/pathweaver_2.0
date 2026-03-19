import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { queryKeys, mutationKeys } from '../../utils/queryKeys'
import toast from 'react-hot-toast'

/**
 * Hook for fetching active bounties with optional filters
 */
export const useBounties = (filters = {}, options = {}) => {
  return useQuery({
    queryKey: queryKeys.bounties.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.pillar) params.append('pillar', filters.pillar)
      if (filters.type) params.append('type', filters.type)
      const query = params.toString()
      const response = await api.get(`/api/bounties${query ? `?${query}` : ''}`)
      return response.data.bounties || []
    },
    ...options,
  })
}

/**
 * Hook for fetching a single bounty by ID
 */
export const useBountyDetail = (bountyId, options = {}) => {
  return useQuery({
    queryKey: queryKeys.bounties.detail(bountyId),
    queryFn: async () => {
      const response = await api.get(`/api/bounties/${bountyId}`)
      return response.data.bounty
    },
    enabled: !!bountyId,
    ...options,
  })
}

/**
 * Hook for fetching current user's claims
 */
export const useMyClaims = (options = {}) => {
  return useQuery({
    queryKey: queryKeys.bounties.myClaims,
    queryFn: async () => {
      const response = await api.get('/api/bounties/my-claims')
      return response.data.claims || []
    },
    ...options,
  })
}

/**
 * Hook for fetching bounties posted by current user
 */
export const useMyPostedBounties = (options = {}) => {
  return useQuery({
    queryKey: queryKeys.bounties.myPosted,
    queryFn: async () => {
      const response = await api.get('/api/bounties/my-posted')
      return response.data.bounties || []
    },
    ...options,
  })
}

/**
 * Hook for claiming a bounty
 */
export const useClaimBounty = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.claimBounty],
    mutationFn: async (bountyId) => {
      const response = await api.post(`/api/bounties/${bountyId}/claim`, {})
      return response.data
    },
    onSuccess: (data, bountyId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.myClaims })
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.detail(bountyId) })
      toast.success('Bounty claimed!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to claim bounty')
    },
  })
}

/**
 * Hook for submitting evidence for a bounty claim
 */
export const useSubmitBountyEvidence = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.submitBountyEvidence],
    mutationFn: async ({ bountyId, claimId, evidence }) => {
      const response = await api.post(`/api/bounties/${bountyId}/submit`, {
        claim_id: claimId,
        evidence,
      })
      return response.data
    },
    onSuccess: (data, { bountyId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.myClaims })
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.detail(bountyId) })
      toast.success('Evidence submitted!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to submit evidence')
    },
  })
}

/**
 * Hook for creating a new bounty
 */
export const useCreateBounty = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.createBounty],
    mutationFn: async (bountyData) => {
      const response = await api.post('/api/bounties', bountyData)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.myPosted })
      toast.success('Bounty created!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to create bounty')
    },
  })
}

/**
 * Hook for deleting a bounty
 */
export const useDeleteBounty = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (bountyId) => {
      const response = await api.delete(`/api/bounties/${bountyId}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.myPosted })
      toast.success('Bounty deleted')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete bounty')
    },
  })
}

/**
 * Hook for toggling a deliverable on a claim
 */
export const useToggleDeliverable = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ bountyId, claimId, deliverableId, completed, evidence }) => {
      const response = await api.put(`/api/bounties/${bountyId}/claims/${claimId}/deliverables`, {
        deliverable_id: deliverableId,
        completed,
        evidence,
      })
      return response.data
    },
    onSuccess: (data, { bountyId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.myClaims })
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.detail(bountyId) })
      if (data.claim?.status === 'submitted') {
        toast.success('All deliverables complete! Submitted for review.')
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update deliverable')
    },
  })
}

/**
 * Hook for turning in a bounty (explicit submission for review)
 */
export const useTurnInBounty = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ bountyId, claimId }) => {
      const response = await api.post(`/api/bounties/${bountyId}/claims/${claimId}/turn-in`, {})
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.myClaims })
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.all })
      toast.success('Bounty turned in for review!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to turn in bounty')
    },
  })
}

/**
 * Hook for deleting a specific evidence item from a deliverable
 */
export const useDeleteEvidence = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ bountyId, claimId, deliverableId, evidenceIndex }) => {
      const response = await api.delete(`/api/bounties/${bountyId}/claims/${claimId}/evidence/${deliverableId}/${evidenceIndex}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.myClaims })
      toast.success('Evidence deleted')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete evidence')
    },
  })
}

/**
 * Hook for reviewing a bounty submission
 */
export const useReviewBounty = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [mutationKeys.reviewBounty],
    mutationFn: async ({ bountyId, claimId, decision, feedback }) => {
      const response = await api.post(`/api/bounties/${bountyId}/review/${claimId}`, {
        decision,
        feedback,
      })
      return response.data
    },
    onSuccess: (data, { bountyId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.detail(bountyId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.bounties.myPosted })
      toast.success('Review submitted!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to submit review')
    },
  })
}
