import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Every teacher-portal page carries the way back out.
 *
 * iCreate, 2026-07-31, three reports in two minutes: "No way to get back to the
 * dashboard from this page" (/my-classes), "No way to get to the teacher
 * dashboard from this page" (/forms, /onboarding). The sidebar's Dashboard link
 * exists but reads as generic nav; the class page's own "← My Classes" is the
 * pattern people actually find.
 */

const authState = { user: { id: 'u1', role: 'org_managed', org_role: 'advisor' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../pages/sis/teacherPreview', () => ({
  getPreviewTeacher: () => null,
  withPreview: (p) => p,
  setPreviewTeacher: vi.fn(),
  clearPreviewTeacher: vi.fn(),
}))
vi.mock('./teacherPreview', () => ({
  getPreviewTeacher: () => null,
  withPreview: (p) => p,
  setPreviewTeacher: vi.fn(),
  clearPreviewTeacher: vi.fn(),
}))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false, activeOrg: null }),
  withOrg: (url, orgId) => `${url}?organization_id=${orgId}`,
}))

const { api } = vi.hoisted(() => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))

import MyClassesPage from './MyClassesPage'
import StaffFormsPage from './StaffFormsPage'
import OnboardingPage from './OnboardingPage'
import MyDocumentsPage from './MyDocumentsPage'
import DirectoryPage from './DirectoryPage'
import MySchedulePage from './MySchedulePage'
import MyTimePage from './MyTimePage'
import MyProfilePage from './MyProfilePage'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(() => Promise.resolve({ data: {} }))
})

const PAGES = [
  ['My Classes', MyClassesPage],
  ['Forms', StaffFormsPage],
  ['Onboarding', OnboardingPage],
  ['My Documents', MyDocumentsPage],
  ['Staff Directory', DirectoryPage],
  ['My schedule', MySchedulePage],
  ['My Time', MyTimePage],
  ['My profile', MyProfilePage],
]

describe('teacher portal pages link back to the dashboard', () => {
  it.each(PAGES)('%s has a back link to /', async (_name, Page) => {
    render(<MemoryRouter><Page /></MemoryRouter>)
    const link = await screen.findByRole('link', { name: /Teacher dashboard/ })
    expect(link).toHaveAttribute('href', '/')
  })
})
