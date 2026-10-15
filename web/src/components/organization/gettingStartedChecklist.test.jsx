import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '../../services/api'
import GettingStartedChecklist from './GettingStartedChecklist'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn() }
}))


const KEY = 'orgSetupChecklistDismissed_org-1'
const COUNTS = { teachers: 1, students: 0, parents: 0, parent_links: 0, classes: 0, class_quests: 0 }

const mount = () => render(<GettingStartedChecklist orgId="org-1" onNavigate={vi.fn()} />)

describe('GettingStartedChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    api.get.mockResolvedValue({ data: { success: true, counts: COUNTS } })
  })

  it('closing without the box hides it for this session only', async () => {
    mount()
    await userEvent.click(await screen.findByTitle('Hide checklist'))
    expect(screen.queryByText('Getting Started')).not.toBeInTheDocument()
    expect(sessionStorage.getItem(KEY)).toBe('true')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('closing with "Don\'t show again" ticked hides it for good', async () => {
    mount()
    await userEvent.click(await screen.findByLabelText("Don't show again"))
    await userEvent.click(screen.getByTitle('Hide checklist'))
    expect(screen.queryByText('Getting Started')).not.toBeInTheDocument()
    expect(localStorage.getItem(KEY)).toBe('true')
  })

  it('stays hidden on the next visit after "Don\'t show again"', () => {
    localStorage.setItem(KEY, 'true')
    mount()
    expect(screen.queryByText('Getting Started')).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('ticking the box alone does not hide it', async () => {
    mount()
    await userEvent.click(await screen.findByLabelText("Don't show again"))
    expect(screen.getByText('Getting Started')).toBeInTheDocument()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

// The SIS dashboard mounts this since 2026-10-15; its onNavigate takes the
// SIS page as the second argument (the console's took the tab, the first).
describe('GettingStartedChecklist in the SIS console', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    api.get.mockResolvedValue({ data: { success: true, counts: COUNTS } })
  })

  it('hands onNavigate the console tab and the SIS page', async () => {
    const onNavigate = vi.fn()
    render(<GettingStartedChecklist orgId="org-1" onNavigate={onNavigate} />)
    await userEvent.click(await screen.findByText('Invite parents'))
    expect(onNavigate).toHaveBeenCalledWith('people', '/people?add=family')
  })

  it('sends "Assign a quest" to the classes when the Library has no Quests tab', async () => {
    const onNavigate = vi.fn()
    const org = { id: 'org-1', effective_modules: ['sis', 'classes'] }
    render(<GettingStartedChecklist orgId="org-1" org={org} onNavigate={onNavigate} />)
    await userEvent.click(await screen.findByText('Assign a quest'))
    expect(onNavigate).toHaveBeenCalledWith('classes', '/classes?tab=all')
  })
})
