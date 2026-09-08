/**
 * The announcements history under "View portal".
 *
 * iCreate, 2026-08-31 (0a10f2ae): "I sent this announcement to only 5 teachers
 * but it's showing up in my preview for a teacher I didn't send it to."
 *
 * The list is drawn by the admin's browser, so without the previewed teacher's
 * id the server answers as the admin — and an admin sees every announcement in
 * the school. The id is the same ?teacher_id= the rest of the teacher portal
 * uses, and the server re-checks that the caller may ask for it; this test is
 * only about the request being made at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../contexts/ConfirmContext', () => ({
  useConfirm: () => vi.fn(async () => true),
  usePromptText: () => vi.fn(async () => null),
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'org_managed', org_role: 'org_admin' } }),
}))
vi.mock('../course/outline/RichTextEditor', () => ({
  default: ({ value, onChange, placeholder }) => (
    <textarea value={value || ''} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} />
  ),
}))
vi.mock('../../pages/sis/useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', orgs: [], isSuperadmin: false }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))

const { preview } = vi.hoisted(() => ({ preview: { current: null } }))
vi.mock('../../pages/sis/teacherPreview', () => ({
  getPreviewTeacher: () => preview.current,
  withPreview: (p) => p,
}))

import AnnouncementComposer from './AnnouncementComposer'

const historyCall = () => api.get.mock.calls.find(([url]) => url === '/api/announcements')

describe('the announcements history in a teacher preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    preview.current = null
    api.get.mockResolvedValue({ data: { success: true, announcements: [], classes: [] } })
  })

  it('asks for the previewed teacher\'s list, not the admin\'s', async () => {
    preview.current = { id: 'teacher-9', name: 'Emerson Gowdy' }
    render(<AnnouncementComposer />)
    await waitFor(() => expect(historyCall()).toBeTruthy())
    expect(historyCall()[1].params).toEqual(
      expect.objectContaining({ organization_id: 'org-1', teacher_id: 'teacher-9' }))
  })

  it('sends no teacher_id when nobody is being previewed', async () => {
    // The ordinary office read of its own sent history must not narrow.
    render(<AnnouncementComposer />)
    await waitFor(() => expect(historyCall()).toBeTruthy())
    expect(historyCall()[1].params).not.toHaveProperty('teacher_id')
    expect(historyCall()[1].params).toEqual(
      expect.objectContaining({ organization_id: 'org-1' }))
  })
})
