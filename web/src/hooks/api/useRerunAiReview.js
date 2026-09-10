import { useMutation } from '@tanstack/react-query'

import api from '../../services/api'
import { mutationKeys } from '../../utils/queryKeys'

/**
 * Ask for a fresh AI read of one credit submission.
 *
 * The review runs on a background thread, so a success here means "queued", not
 * "done" -- the dashboard polls the detail until it settles.
 *
 * A 409 is resolved rather than thrown. It means a review of this submission is
 * genuinely in flight, which is the outcome the reviewer asked for; surfacing it
 * as an error would tell them their click failed when it did exactly what they
 * wanted. Everything else is a real failure and reaches onError.
 */
export const useRerunAiReview = () => useMutation({
  mutationKey: [mutationKeys.rerunAiReview],
  mutationFn: async (completionId) => {
    try {
      const { data } = await api.post(
        `/api/credit-dashboard/items/${completionId}/ai-review`, {})
      return (data?.data || data)?.ai || { status: 'queued' }
    } catch (err) {
      if (err.response?.status === 409) return { status: 'running' }
      throw err
    }
  },
})

export default useRerunAiReview
