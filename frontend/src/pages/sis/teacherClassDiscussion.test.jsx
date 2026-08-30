import { describe, it, expect, vi } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * The students' discussion board reaches the teacher.
 *
 * It had been on every class quest page since July with no adult surface
 * rendering it; Gryffin's students wrote 80 posts in two days before their
 * teacher asked whether "teachers and parents see a group chat" (2026-08-29).
 */

const render = (ui) => rtlRender(
  <MemoryRouter initialEntries={['/my-classes/c1?tab=discussion']}>
    <Routes><Route path="/my-classes/:classId" element={ui} /></Routes>
  </MemoryRouter>,
)

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1' }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../components/sis/StudentProgressTab', () => ({ default: () => <div /> }))
vi.mock('../../components/discussion/ClassDiscussion', () => ({
  default: ({ classId }) => <div data-testid="discussion">board for {classId}</div>,
}))
vi.mock('../../components/discussion/ClassCurriculum', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassCurriculumLibrary', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassQuestsManager', () => ({ default: () => <div /> }))
vi.mock('../../components/sis/ClassMessagesTab', () => ({ default: () => <div /> }))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn((url) => Promise.resolve(
      url.includes('/roster')
        ? { data: { class: { id: 'c1', name: 'Earth Science' }, students: [] } }
        : { data: { attendance: [] } },
    )),
    post: vi.fn(),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import TeacherClassPage from './TeacherClassPage'

describe('TeacherClassPage — Discussion tab', () => {
  it('has a Discussion tab that mounts the class board keyed by class id', async () => {
    render(<TeacherClassPage />)

    const tab = await screen.findByRole('button', { name: 'Discussion' })
    fireEvent.click(tab)
    expect(await screen.findByTestId('discussion')).toHaveTextContent('board for c1')
  })
})
