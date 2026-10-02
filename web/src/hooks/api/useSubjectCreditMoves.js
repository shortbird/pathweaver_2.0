import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'

/**
 * Moving a quest's credit to another subject (2026-10-02).
 *
 * A family asks from Courses and Credits (backend
 * routes/quest/courses_and_credits.py, /move-requests); Optio decides in the
 * credit dashboard (routes/credit_dashboard/subject_moves.py). Nothing moves
 * until Optio approves. The family's pending requests come back on the
 * Courses and Credits payload as `move_requests`, so that page reloads its
 * plan after either mutation here rather than keeping a second copy.
 */

export const subjectMoveKeys = {
  queue: (status) => ['credit-dashboard', 'subject-moves', status],
}

const unwrap = (res) => res.data?.data ?? res.data

/** The family asks. body: { quest_id, from_subject, to_subject, reason?, student_id? } */
export const useRequestSubjectMove = () => useMutation({
  mutationFn: async (body) => unwrap(await api.post('/api/courses-and-credits/move-requests', body)),
})

/** The family takes it back. */
export const useCancelSubjectMove = () => useMutation({
  mutationFn: async ({ requestId, studentId }) => unwrap(await api.post(
    `/api/courses-and-credits/move-requests/${requestId}/cancel`,
    studentId ? { student_id: studentId } : {},
  )),
})

/** Optio's queue. Superadmin only. */
export const useSubjectMoveQueue = (status = 'pending', options = {}) => useQuery({
  queryKey: subjectMoveKeys.queue(status),
  queryFn: async () => unwrap(await api.get('/api/credit-dashboard/subject-moves', { params: { status } }))?.items || [],
  staleTime: 15 * 1000,
  ...options,
})

/** Optio decides. decision: 'approve' | 'decline'; note is required to decline. */
export const useDecideSubjectMove = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, decision, note }) => {
      const body = note ? { note } : {}
      // Spelled out, not `/${decision}`: the backend test that every client
      // path is a real route reads these literals.
      const res = decision === 'approve'
        ? await api.post(`/api/credit-dashboard/subject-moves/${requestId}/approve`, body)
        : await api.post(`/api/credit-dashboard/subject-moves/${requestId}/decline`, body)
      return unwrap(res)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credit-dashboard', 'subject-moves'] }),
  })
}

/** The message a refused request carries, or `fallback`. */
export const subjectMoveError = (err, fallback) => {
  const e = err?.response?.data?.error
  if (typeof e === 'string') return e
  return e?.message || fallback
}
