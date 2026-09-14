import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { queryKeys } from '../../utils/queryKeys'
import { useAuth } from '../../contexts/AuthContext'

/**
 * The family photo across the top of the family dashboard
 * (/api/parent/family-cover). It is the signed-in parent's own
 * (users.family_cover_url), so the key carries the parent.
 */
export function useFamilyCover() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.family.cover(user?.id),
    queryFn: async () => {
      const r = await api.get('/api/parent/family-cover')
      return r.data?.family_cover_url || null
    },
    enabled: !!user?.id,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUploadFamilyCover() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (file) => {
      const formData = new FormData()
      formData.append('cover', file)
      const r = await api.post('/api/parent/family-cover', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return r.data?.family_cover_url || null
    },
    onSuccess: (url) => queryClient.setQueryData(queryKeys.family.cover(user?.id), url),
  })
}

export function useRemoveFamilyCover() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: () => api.delete('/api/parent/family-cover'),
    onSuccess: () => queryClient.setQueryData(queryKeys.family.cover(user?.id), null),
  })
}
