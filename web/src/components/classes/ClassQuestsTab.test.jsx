import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * Reading a quest back, from the class where it was assigned.
 *
 * Gryffin Learning Center, 2026-08-27: "There also isn't a way to currently see
 * the instructions that we gave for each quest." The row showed the title and
 * one clamped line of description, and the only way to see the tasks was the
 * quest editor -- which lived on a page advisors cannot reach.
 *
 * Tasks are fetched when a row is first opened rather than with the list: a
 * class can carry a dozen quests, and their tasks are only wanted for the one
 * being read.
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isSuperadmin: false, user: { id: 'adv-1' } }),
}))

vi.mock('../../contexts/OrganizationContext', () => ({
  useOrgFeature: () => false,
}))

const { api, classService } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  classService: {
    getClassQuests: vi.fn(),
    removeQuestFromClass: vi.fn(),
    reorderClassQuests: vi.fn(),
  },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../services/classService', () => ({ default: classService }))
vi.mock('./AddQuestModal', () => ({ default: () => null }))
vi.mock('../admin/QuestForm', () => ({ default: () => null }))

import ClassQuestsTab from './ClassQuestsTab'

const QUEST = {
  quest_id: 'q1',
  quests: {
    id: 'q1',
    title: 'Bridge Building',
    description: 'Build a bridge that holds a textbook.',
    material_link: 'https://example.com/bridges',
    is_active: true,
  },
}

const TASKS = [
  { id: 't1', title: 'Sketch three designs', description: 'Label the forces on each.',
    pillar: 'stem', xp_value: 50 },
  { id: 't2', title: 'Build the strongest one', description: '', pillar: 'stem', xp_value: 100 },
]

beforeEach(() => {
  vi.clearAllMocks()
  classService.getClassQuests.mockResolvedValue({ success: true, quests: [QUEST] })
  api.get.mockResolvedValue({ data: { tasks: TASKS } })
})

const renderTab = () =>
  render(<ClassQuestsTab orgId="org-1" classId="c1" classData={{}} onUpdate={vi.fn()} />)

describe('reading a quest from the class Quests tab', () => {
  it('does not fetch tasks until a quest is opened', async () => {
    renderTab()
    await screen.findByText('Bridge Building')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('shows the tasks and their instructions when opened', async () => {
    renderTab()
    fireEvent.click(await screen.findByText('Bridge Building'))

    expect(await screen.findByText('Sketch three designs')).toBeInTheDocument()
    expect(screen.getByText('Label the forces on each.')).toBeInTheDocument()
    expect(screen.getByText('Build the strongest one')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/admin/quests/q1/template-tasks')
  })

  it('shows the quest instructions and material link', async () => {
    renderTab()
    fireEvent.click(await screen.findByText('Bridge Building'))

    expect(await screen.findByText('Build a bridge that holds a textbook.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://example.com/bridges' }))
      .toHaveAttribute('href', 'https://example.com/bridges')
  })

  it('carries the XP and pillar of each task', async () => {
    renderTab()
    fireEvent.click(await screen.findByText('Bridge Building'))

    expect(await screen.findByText('50 XP')).toBeInTheDocument()
    expect(screen.getByText('100 XP')).toBeInTheDocument()
    expect(screen.getAllByText('stem').length).toBe(2)
  })

  it('says so plainly when a quest has no tasks yet', async () => {
    api.get.mockResolvedValue({ data: { tasks: [] } })
    renderTab()
    fireEvent.click(await screen.findByText('Bridge Building'))
    expect(await screen.findByText('This quest has no tasks yet.')).toBeInTheDocument()
  })

  it('closes again without refetching', async () => {
    renderTab()
    const title = await screen.findByText('Bridge Building')
    fireEvent.click(title)
    await screen.findByText('Sketch three designs')
    fireEvent.click(title)
    await waitFor(() =>
      expect(screen.queryByText('Sketch three designs')).not.toBeInTheDocument())
    fireEvent.click(title)
    await screen.findByText('Sketch three designs')
    expect(api.get).toHaveBeenCalledTimes(1)
  })
})
