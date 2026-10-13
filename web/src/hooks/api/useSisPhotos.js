import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * Group photos (ticket 85949de5, routes/sis/photos.py): the school's students
 * to tag, its recent captures, and the save. A save is two requests -- the
 * files go up first (the server scans them and answers durable pointers),
 * then the capture names those pointers and the tagged students. orgId is in
 * the key so a superadmin switching schools never sees the last school's.
 */

export const useSisPhotos = (orgId) => useQuery({
  queryKey: queryKeys.sis.photos(orgId),
  queryFn: async () => (await api.get(withOrg('/api/sis/photos', orgId))).data,
  enabled: !!orgId,
  staleTime: 30 * 1000,
})

/** {files: File[], studentIds, caption, eventDate} -> the server's answer:
 * {count, families_notified, parents_notified}. */
export const useSavePhotos = (orgId) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ files, studentIds, caption, eventDate }) => {
      let media = []
      if (files.length) {
        const form = new FormData()
        files.forEach((f) => form.append('files', f))
        if (orgId) form.append('organization_id', orgId)
        const { data } = await api.post(withOrg('/api/sis/photos/upload', orgId), form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        media = (data.files || []).map((f) => ({
          type: (f.content_type || '').startsWith('video') ? 'video' : 'image',
          file_url: f.url,
          file_name: f.original_name || f.stored_name,
          file_size: f.size,
        }))
      }
      const { data } = await api.post(withOrg('/api/sis/photos', orgId), {
        student_ids: studentIds, caption, event_date: eventDate || null, media,
      })
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sis.photos(orgId) }),
  })
}
