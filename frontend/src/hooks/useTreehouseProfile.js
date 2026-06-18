import { useQuery } from '@tanstack/react-query'
import { treehouseAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

/**
 * Lightweight Treehouse profile for gating UI (F1/F2):
 *   { isMember, isFacilitator, isAdmin, simplified }
 * `simplified` is true for young learners (a cohort with ui_mode='simple'), which
 * drives the big-button task view. Only fetched for org-managed users so platform
 * users never hit the endpoint. Cached for the session.
 */
export function useTreehouseProfile() {
  const { user } = useAuth()
  // Treehouse users are org-managed (organization_id set) or superadmin.
  const maybeTreehouse = !!user && (user.organization_id || user.role === 'superadmin')

  const { data } = useQuery({
    queryKey: ['treehouse', 'me', user?.id],
    queryFn: async () => {
      try {
        const res = await treehouseAPI.me()
        return res.data
      } catch {
        return { is_member: false, is_facilitator: false, is_admin: false, simplified: false }
      }
    },
    enabled: !!maybeTreehouse,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return {
    isMember: !!data?.is_member,
    isFacilitator: !!data?.is_facilitator,
    isAdmin: !!data?.is_admin,
    simplified: !!data?.simplified,
  }
}
