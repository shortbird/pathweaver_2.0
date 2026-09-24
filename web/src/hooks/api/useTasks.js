import { useQuery } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * Tasks -- one table since 2026-09-24 (iCreate meeting 2026-09-23): every
 * thing the school asks of anybody, one step or many.
 *
 * Two kinds of door, because two kinds of caller:
 *
 *   taskApi       /api/sis/tasks/<id>/... -- authorized by the TASK (its
 *                 assignee, whoever assigned it, or an admin of that school),
 *                 so it serves a teacher, a parent and a student alike.
 *   familyTaskApi /api/sis/parent/onboarding/... -- the same writes through
 *                 the family portal's own routes, which are the ones a family
 *                 held by a required signature may still reach
 *                 (middleware/api_hold_gate.py). Used by the hold screen.
 *
 * Both have one shape, so TaskCard takes either and does not care which.
 */

const post = (url, body = {}) => api.post(url, body)

export const taskApi = {
  get: (taskId) => api.get(`/api/sis/tasks/${taskId}`),
  patchItem: (task, itemKey, fields) =>
    api.patch(`/api/sis/tasks/${task.id}/items/${itemKey}`, fields),
  upload: async (task, file) => {
    const form = new FormData()
    form.append('file', file)
    const r = await api.post(`/api/sis/tasks/${task.id}/upload`, form)
    return r.data?.path
  },
  docUrl: async (task, path) => {
    const r = await api.get(`/api/sis/tasks/${task.id}/doc-url?path=${encodeURIComponent(path)}`)
    return r.data?.url
  },
  signDocUrl: async (task, docId) => {
    const r = await api.get(`/api/sis/tasks/${task.id}/sign-documents/${docId}/url`)
    return r.data?.url
  },
  comments: async (taskId) => {
    const r = await api.get(`/api/sis/tasks/${taskId}/comments`)
    return r.data?.comments || []
  },
  addComment: async (taskId, body) => {
    const r = await post(`/api/sis/tasks/${taskId}/comments`, { body })
    return r.data?.comment
  },
}

export const familyTaskApi = (orgId) => ({
  ...taskApi,
  patchItem: (task, itemKey, fields) =>
    api.patch(`/api/sis/parent/onboarding/${task.id}/items/${itemKey}`, {
      organization_id: orgId, ...fields,
    }),
  upload: async (task, file) => {
    const form = new FormData()
    form.append('file', file)
    const r = await api.post(`/api/sis/parent/onboarding/upload?organization_id=${orgId}`, form)
    return r.data?.path
  },
  docUrl: async (task, path) => {
    const r = await api.get(`/api/sis/parent/onboarding/doc-url?organization_id=${orgId}&path=${encodeURIComponent(path)}`)
    return r.data?.url
  },
  signDocUrl: async (task, docId) => {
    const r = await api.get(`/api/sis/parent/my-documents/${docId}/url?organization_id=${orgId}`)
    return r.data?.url
  },
})

/** The office's side. */
export const officeTaskApi = {
  assign: (orgId, body) => post('/api/sis/tasks', { organization_id: orgId, ...body }),
  saveAsTemplate: (orgId, taskId, name) =>
    post(`/api/sis/tasks/${taskId}/save-template`, { organization_id: orgId, name }),
  updateSchedule: (orgId, scheduleId, fields) =>
    api.patch(`/api/sis/tasks/schedules/${scheduleId}`, { organization_id: orgId, ...fields }),
  grid: (orgId, scheduleId, { since, until } = {}) => {
    const q = [since && `since=${since}`, until && `until=${until}`].filter(Boolean).join('&')
    return api.get(withOrg(`/api/sis/tasks/schedules/${scheduleId}/grid${q ? `?${q}` : ''}`, orgId))
  },
}

export const useAssignedTasks = (orgId) => useQuery({
  queryKey: queryKeys.sis.assignedTasks(orgId),
  queryFn: async () => {
    const r = await api.get(withOrg('/api/sis/tasks/assigned', orgId))
    return r.data?.batches || []
  },
  enabled: !!orgId,
  staleTime: 15 * 1000,
})

export const useTaskSchedules = (orgId) => useQuery({
  queryKey: queryKeys.sis.taskSchedules(orgId),
  queryFn: async () => {
    const r = await api.get(withOrg('/api/sis/tasks/schedules', orgId))
    return r.data?.schedules || []
  },
  enabled: !!orgId,
  staleTime: 15 * 1000,
})

/** "Pick a class" on the student list: that class's roster, narrowed to the
 *  org's students by the server, which refuses another org's class. */
export const useClassStudents = (orgId, classId) => useQuery({
  queryKey: queryKeys.sis.classStudents(orgId, classId),
  queryFn: async () => {
    const r = await api.get(withOrg(
      `/api/sis/staff-admin/onboarding/recipients?audience=student&class_id=${encodeURIComponent(classId)}`,
      orgId))
    return r.data?.recipients || []
  },
  enabled: !!orgId && !!classId,
  staleTime: 30 * 1000,
})
