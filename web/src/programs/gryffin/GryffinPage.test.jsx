/**
 * Which Gryffin view each role gets.
 *
 * The page branched on `isStudent` alone, so every non-student fell into the
 * staff branch and ClassList called /api/advisor/classes — @require_role(
 * *STAFF_ROLES) on the backend. A Gryffin PARENT is neither, so the school's
 * own tab answered her with a 403 and "Failed to load classes" (Sentry
 * OPTIO-WEB-16, 2026-09-10). Parents and observers now get their children
 * instead, and a teacher who is also a parent still gets the manager.
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authValue = { user: { organization_id: 'org-1' }, effectiveRoles: [] }

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authValue,
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({}),
  Link: ({ to, children }) => <a href={to}>{children}</a>,
}))

vi.mock('../../components/classes', () => ({
  ClassList: () => <div data-testid="class-manager" />,
  ClassDetailPage: () => <div data-testid="class-detail" />,
}))
vi.mock('../../components/classes/StudentClassesView', () => ({
  default: () => <div data-testid="student-classes" />,
}))
vi.mock('../../components/classes/StudentAgenda', () => ({
  default: () => <div data-testid="student-agenda" />,
}))

import GryffinPage from './GryffinPage'

const renderAs = (roles) => {
  authValue.effectiveRoles = roles
  return render(<GryffinPage />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GryffinPage role branching', () => {
  it('gives a student their own classes', () => {
    renderAs(['student'])
    expect(screen.getByTestId('student-classes')).toBeInTheDocument()
    expect(screen.queryByTestId('class-manager')).not.toBeInTheDocument()
  })

  it.each([['advisor'], ['org_admin'], ['campus_coordinator'], ['superadmin']])(
    'gives %s the class manager',
    (role) => {
      renderAs([role])
      expect(screen.getByTestId('class-manager')).toBeInTheDocument()
    }
  )

  it('does NOT call the staff class list for a parent', () => {
    renderAs(['parent'])
    expect(screen.queryByTestId('class-manager')).not.toBeInTheDocument()
    expect(screen.getByText('Go to my children')).toHaveAttribute(
      'href', '/parent/dashboard'
    )
  })

  it('does NOT call the staff class list for an observer', () => {
    renderAs(['observer'])
    expect(screen.queryByTestId('class-manager')).not.toBeInTheDocument()
  })

  it('gives a teacher who is also a parent the class manager', () => {
    renderAs(['parent', 'advisor'])
    expect(screen.getByTestId('class-manager')).toBeInTheDocument()
  })

  it('falls back to the family view when the role list is missing', () => {
    authValue.effectiveRoles = undefined
    render(<GryffinPage />)
    expect(screen.queryByTestId('class-manager')).not.toBeInTheDocument()
  })
})
