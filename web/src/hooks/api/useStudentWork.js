import { useQuery, useQueryClient } from '@tanstack/react-query'

import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import { queryKeys } from '../../utils/queryKeys'

/**
 * A teacher working with one student, outside any class (2026-10-07).
 *
 * The API behind the Classes page's Students tab and the one-student page:
 * the school's students, one student's quests task by task, giving and taking
 * back a quest, its due date, and tasks written for that student. The routes
 * are routes/sis/student_work.py; the rules are
 * services/student_quest_assignments.py. Private notes reuse the platform's
 * advisor notes (/api/advisor/notes), which any staff member of the student's
 * school may write and only the author reads.
 */

const base = (studentId) => `/api/sis/student-work/students/${studentId}`

export const studentWorkKeys = {
  list: (orgId) => [...queryKeys.sis.all, 'studentWork', 'list', orgId],
  student: (orgId, studentId) => [...queryKeys.sis.all, 'studentWork', 'student', orgId, studentId],
  notes: (studentId) => [...queryKeys.sis.all, 'studentWork', 'notes', studentId],
}

/** Where the quest editor publishes a quest started for one student. */
export const studentQuestPublishPath = (studentId, questId) => `${base(studentId)}/quests/${questId}/publish`

export const studentWorkApi = {
  async students(orgId) {
    const res = await api.get(withOrg('/api/sis/student-work/students', orgId))
    return res.data?.students || []
  },

  async student(orgId, studentId) {
    const res = await api.get(withOrg(base(studentId), orgId))
    return res.data
  },

  async assignableQuests(orgId, studentId, search) {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    const res = await api.get(withOrg(`${base(studentId)}/assignable-quests?${params.toString()}`, orgId))
    return res.data?.quests || []
  },

  /** dueDate: 'YYYY-MM-DD' or empty. */
  async give(orgId, studentId, questId, dueDate) {
    const res = await api.post(withOrg(`${base(studentId)}/quests`, orgId),
      { quest_id: questId, due_date: dueDate || null })
    return res.data
  },

  async setDueDate(orgId, studentId, questId, dueDate) {
    const res = await api.patch(withOrg(`${base(studentId)}/quests/${questId}`, orgId),
      { due_date: dueDate || null })
    return res.data
  },

  async takeBack(orgId, studentId, questId) {
    const res = await api.delete(withOrg(`${base(studentId)}/quests/${questId}`, orgId))
    return res.data
  },

  async addTask(orgId, studentId, questId, task) {
    const res = await api.post(withOrg(`${base(studentId)}/quests/${questId}/tasks`, orgId), task)
    return res.data?.task
  },

  async removeTask(orgId, studentId, taskId) {
    const res = await api.delete(withOrg(`${base(studentId)}/tasks/${taskId}`, orgId))
    return res.data
  },

  async notes(studentId) {
    const res = await api.get(`/api/advisor/notes/${studentId}`)
    return res.data?.notes || []
  },

  async addNote(studentId, text) {
    const res = await api.post('/api/advisor/notes', { subject_id: studentId, note_text: text })
    return res.data?.note
  },

  async deleteNote(noteId) {
    const res = await api.delete(`/api/advisor/notes/${noteId}`)
    return res.data
  },
}

export const useStudentWorkList = (orgId) => useQuery({
  queryKey: studentWorkKeys.list(orgId),
  queryFn: () => studentWorkApi.students(orgId),
  enabled: !!orgId,
  staleTime: 30 * 1000,
})

export const useStudentWork = (orgId, studentId) => useQuery({
  queryKey: studentWorkKeys.student(orgId, studentId),
  queryFn: () => studentWorkApi.student(orgId, studentId),
  enabled: !!orgId && !!studentId,
})

export const useStudentNotes = (studentId) => useQuery({
  queryKey: studentWorkKeys.notes(studentId),
  queryFn: () => studentWorkApi.notes(studentId),
  enabled: !!studentId,
})

/** Refresh the student's page and the Students list after a change. */
export const useRefreshStudentWork = (orgId, studentId) => {
  const qc = useQueryClient()
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: studentWorkKeys.student(orgId, studentId) }),
    qc.invalidateQueries({ queryKey: studentWorkKeys.list(orgId) }),
  ])
}
