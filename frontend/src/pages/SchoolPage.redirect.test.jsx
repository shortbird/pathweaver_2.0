import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SchoolPage from './SchoolPage'

let authState = {}
let orgState = {}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../contexts/OrganizationContext', () => ({
  useOrganization: () => orgState
}))

// The page's data fetches and community components are irrelevant to the
// redirect under test; keep them inert.
vi.mock('../services/api', () => ({
  default: { get: vi.fn(() => new Promise(() => {})) }
}))
vi.mock('../components/announcements/AnnouncementBody', () => ({ default: () => null }))
vi.mock('../components/announcements/SchoolCommunity', () => ({
  default: () => null,
  FeedSection: () => null,
  hasCommunityContent: () => false
}))
vi.mock('../components/announcements/CarpoolBoard', () => ({ default: () => null }))

function renderSchool() {
  return render(
    <MemoryRouter initialEntries={['/school']}>
      <Routes>
        <Route path="/school" element={<SchoolPage />} />
        <Route path="/" element={<div data-testid="marketing-home" />} />
        <Route path="/dashboard" element={<div data-testid="student-dashboard" />} />
        <Route path="/parent/dashboard" element={<div data-testid="parent-dashboard" />} />
      </Routes>
    </MemoryRouter>
  )
}

// A member whose school context is missing (context fetch failed, or the school
// turned its homepage off) must land on their own app home — bouncing to the
// marketing homepage read as "you got logged out".
describe('SchoolPage without school context', () => {
  beforeEach(() => {
    orgState = { school: null, loading: false }
  })

  it('sends a parent to their role home, not the marketing homepage', () => {
    authState = { user: { id: 'u1' }, effectiveRole: 'parent' }
    renderSchool()
    expect(screen.getByTestId('student-dashboard')).toBeInTheDocument()
    expect(screen.queryByTestId('marketing-home')).not.toBeInTheDocument()
  })

  it('sends a student to the dashboard', () => {
    authState = { user: { id: 'u1' }, effectiveRole: 'student' }
    renderSchool()
    expect(screen.getByTestId('student-dashboard')).toBeInTheDocument()
  })
})
