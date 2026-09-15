import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { storiesApi } from '../../services/storiesApi'
import { queryKeys } from '../../utils/queryKeys'

/**
 * The story queue: feed items a superadmin bookmarked in the mobile app
 * (/api/admin/stories/candidates). Each row comes enriched -- who, what,
 * and which story sources can start from it today -- so the Stories page
 * can offer the same Draft-for-review button the grader has.
 */
export function useStoryCandidates(status = 'open', options = {}) {
  return useQuery({
    queryKey: queryKeys.admin.storyCandidates(status),
    queryFn: async () => {
      const d = await storiesApi.candidates(status)
      return d?.candidates || []
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
    ...options,
  })
}

/** Drop a bookmark from the queue without starting a story. */
export function useDismissStoryCandidate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (candidateId) => storiesApi.dismissCandidate(candidateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.all, 'story-candidates'] }),
  })
}

/** Start a story from a bookmark; the backend moves the row to `started`. */
export function useStartStoryFromCandidate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ candidateId, sourceType, sourceId }) =>
      storiesApi.start({ sourceType, sourceId, mode: 'review', candidateId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.all, 'story-candidates'] }),
  })
}
