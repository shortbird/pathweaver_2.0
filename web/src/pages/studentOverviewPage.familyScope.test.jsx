/**
 * The child's profile in family scope carries what the old parent dashboard
 * held and the child's own view does not: the read-only Communications
 * section (DMs, class chats, AI tutor), and a pointer to Family Settings in
 * place of the account form.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import StudentOverviewPage from './StudentOverviewPage'
import api from '../services/api'

let scope = { selectedChild: null }
let studentScope = { params: {}, isDelegated: false }
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'parent-1', first_name: 'Paige', role: 'parent' }, updateUser: vi.fn(), loginTimestamp: 1 }),
}))
vi.mock('../contexts/ActingAsContext', () => ({ useActingAs: () => ({ actingAsDependent: null }) }))
vi.mock('../contexts/FamilyScopeContext', () => ({ useFamilyScope: () => scope }))
vi.mock('../hooks/useStudentScope', () => ({ useStudentScope: () => studentScope }))
vi.mock('../services/api', () => ({ default: { get: vi.fn(), put: vi.fn() } }))
vi.mock('../programs/registry', () => ({ fetchProgramDiploma: vi.fn().mockResolvedValue(null) }))
vi.mock('react-helmet-async', () => ({ Helmet: () => null }))
vi.mock('../components/overview/StudentOverviewSections', () => ({ default: ({ afterJournal }) => <div>{afterJournal}</div> }))
vi.mock('../components/overview/WeeklyXpGoalCard', () => ({ default: () => null }))
vi.mock('../components/overview/AccountSettings', () => ({ default: () => <div data-testid="account-form" /> }))
vi.mock('../components/overview/CollapsibleSection', () => ({ default: ({ title, children }) => <section aria-label={title}>{children}</section> }))
vi.mock('../components/overview/EditProfileModal', () => ({ default: () => null }))
vi.mock('../components/diploma/PublicConsentModal', () => ({ default: () => null }))
vi.mock('../components/overview/HeroSection', () => ({ default: () => null }))
vi.mock('../components/parent/ParentConversationsViewer', () => ({
  default: ({ studentId }) => <div data-testid="conversations">{studentId}</div>,
}))

function renderPage() {
  return render(<MemoryRouter><StudentOverviewPage /></MemoryRouter>)
}

describe('StudentOverviewPage in family scope', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: { stats: {}, achievements: [] } })
  })

  it("shows the child's communication history and points account settings at Family Settings", async () => {
    scope = { selectedChild: { id: 'romney', firstName: 'Romney', avatarUrl: null } }
    studentScope = { params: { student_id: 'romney' }, isDelegated: true }
    renderPage()
    await waitFor(() => expect(screen.getByTestId('conversations')).toHaveTextContent('romney'))
    expect(screen.getByRole('link', { name: 'Family settings' })).toHaveAttribute('href', '/family?settings=romney')
    expect(screen.queryByTestId('account-form')).not.toBeInTheDocument()
  })

  it('shows neither to the student on their own profile', async () => {
    scope = { selectedChild: null }
    studentScope = { params: {}, isDelegated: false }
    renderPage()
    await waitFor(() => expect(screen.getByTestId('account-form')).toBeInTheDocument())
    expect(screen.queryByTestId('conversations')).not.toBeInTheDocument()
  })
})
