import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'

/**
 * How the AI credit reviewer sizes XP: the editable scale and the worked
 * examples (backend routes/credit_dashboard/xp_calibration.py). Superadmin only.
 * Whatever is saved here goes into the next AI review's prompt, so this is how
 * Optio tunes the reviewer without a deploy.
 */
const BASE = '/api/credit-dashboard/xp-calibration'

export const useXpCalibration = (options = {}) => useQuery({
  queryKey: queryKeys.admin.xpCalibration(),
  queryFn: async () => (await api.get(BASE)).data?.data || { guide: null, examples: [] },
  staleTime: 30 * 1000,
  ...options,
})

/**
 * One mutation for every write. `op` is one of:
 *   { kind: 'save-guide', content }
 *   { kind: 'reset-guide' }
 *   { kind: 'add', example: { work, xp, note, completion_id } }
 *   { kind: 'edit', id, changes }
 *   { kind: 'remove', id }
 */
export const useXpCalibrationAction = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (op) => {
      switch (op.kind) {
        case 'save-guide': return (await api.put(`${BASE}/guide`, { content: op.content })).data
        case 'reset-guide': return (await api.post(`${BASE}/guide/reset`, {})).data
        case 'add': return (await api.post(`${BASE}/examples`, op.example)).data
        case 'edit': return (await api.patch(`${BASE}/examples/${op.id}`, op.changes)).data
        case 'remove': return (await api.delete(`${BASE}/examples/${op.id}`)).data
        default: throw new Error(`Unknown XP calibration action: ${op.kind}`)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.xpCalibration() }),
  })
}

export default useXpCalibration
