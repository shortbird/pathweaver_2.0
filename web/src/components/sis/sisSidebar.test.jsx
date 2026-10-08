import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SisSidebar from './SisSidebar'

/**
 * The sidebar is a function of the modules (docs/sis/SIS_SIMPLIFICATION.md,
 * rule 1), and an admin always has a way to the features that are off.
 */

let state = { user: null, org: null }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('../../pages/sis/useSisOrg', () => ({ useSisOrg: () => ({ activeOrg: state.org }) }))
vi.mock('../../pages/sis/teacherPreview', () => ({ getPreviewTeacher: () => null }))
vi.mock('./RoleViewSwitcher', () => ({ default: () => null }))
vi.mock('./InboxUnreadBadge', () => ({ default: () => null }))

const ADMIN = { id: 'a1', role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin'] }

// Apogee Cache Valley after phase 7: the target sidebar Tanner set on 2026-10-08.
const APOGEE = {
  id: 'org-1',
  effective_modules: ['sis', 'individual_work', 'submissions', 'prior_learning', 'goals',
    'weekly_goals', 'points', 'bounties', 'bounty_management', 'bloomy', 'messaging'],
}

const names = () => within(screen.getByRole('navigation')).getAllByRole('link').map((a) => a.textContent.trim())

describe('SisSidebar', () => {
  it("shows Apogee exactly its blocks, with Operations holding only Messaging", () => {
    state = { user: ADMIN, org: APOGEE }
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(names()).toEqual(['Dashboard', 'People', 'Students', 'Prior Learning', 'Goals',
      'Points', 'Bounties', 'Bloomy', 'Messaging', 'Settings', 'My Profile', 'Add features'])
  })

  it('takes an admin to the Features card', () => {
    state = { user: ADMIN, org: APOGEE }
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /Add features/ })).toHaveAttribute('href', '/settings#settings-features')
  })

  it('a teacher gets no Add features link', () => {
    state = { user: { id: 't1', role: 'org_managed', org_role: 'advisor', org_roles: ['advisor'] }, org: APOGEE }
    render(<MemoryRouter><SisSidebar /></MemoryRouter>)
    expect(screen.queryByRole('link', { name: /Add features/ })).not.toBeInTheDocument()
  })
})
