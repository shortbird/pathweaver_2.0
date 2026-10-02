/**
 * The Learning Snapshot's quests, grouped by class, sortable, and removable
 * by the school office.
 *
 * iCreate, 2026-10-01 (d8a2a8d4, Marika, org_admin, /overview): "make all the
 * quests in a student's learning snapshot be categorized and sortable? It is
 * super chaotic... how does one get rid of quests that shouldn't be there. AJ
 * should not have any elementary classes/quests on his since he is in high
 * school".
 */
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { groupQuests, questProgress } from './snapshotQuestGroups'
import LearningSnapshot from './LearningSnapshot'
import { withConfirm, confirmText, answerConfirm } from '../../tests/confirmTestUtils'

const { api, auth } = vi.hoisted(() => ({
  api: { delete: vi.fn() },
  auth: { value: { user: { id: 'office-1' }, effectiveRoles: ['org_admin'] } },
}))
vi.mock('../../services/api', () => ({ default: api }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth.value }))
vi.mock('../../contexts/FamilyScopeContext', () => ({ useFamilyScope: () => ({ enterScope: vi.fn() }) }))
vi.mock('../../hooks/api/useQuests', () => ({
  useQuestEngagement: () => ({ data: null }),
  useStudentQuestEngagement: () => ({ data: null }),
}))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))


const BIO = { id: 'c-bio', name: 'Biology', enrolled: true }
const ART = { id: 'c-art', name: 'Elementary Art', enrolled: false }
const q = (id, title, extra = {}) => ({ quest_id: id, quests: { id, title }, ...extra })

const QUESTS = [
  q('q-cells', 'Cells', { source_class: BIO, last_activity_at: '2026-09-20T00:00:00Z',
    progress: { percentage: 10 } }),
  q('q-paint', 'Finger paint', { source_class: ART, last_activity_at: '2026-08-01T00:00:00Z',
    progress: { percentage: 0 } }),
  q('q-robot', 'My robot', { source_class: null, last_activity_at: '2026-09-30T00:00:00Z',
    progress: { percentage: 60 } }),
  q('q-atoms', 'Atoms', { source_class: BIO, last_activity_at: '2026-09-29T00:00:00Z',
    progress: { percentage: 90 } }),
]

const renderSnapshot = (props = {}) => render(withConfirm(
  <MemoryRouter>
    <LearningSnapshot engagementData={{ calendar: [] }} activeQuests={QUESTS}
      studentId="aj" studentName="AJ" viewerMode="advisor" {...props} />
  </MemoryRouter>,
))

beforeEach(() => {
  vi.clearAllMocks()
  auth.value = { user: { id: 'office-1' }, effectiveRoles: ['org_admin'] }
})

describe('groupQuests', () => {
  it('current classes first, then Personal, then classes the student left', () => {
    const groups = groupQuests(QUESTS)
    expect(groups.map((g) => g.label)).toEqual(['Biology', 'Personal', 'Elementary Art'])
    expect(groups.map((g) => g.former)).toEqual([false, false, true])
  })

  it('sorts inside each group by the chosen key', () => {
    const bio = (sort) => groupQuests(QUESTS, sort)[0].quests.map((x) => x.quests.title)
    expect(bio('recent')).toEqual(['Atoms', 'Cells'])
    expect(bio('name')).toEqual(['Atoms', 'Cells'])
    expect(bio('progress')).toEqual(['Atoms', 'Cells'])
    const flipped = [
      q('a', 'Zebra', { source_class: BIO, progress: { percentage: 5 }, last_activity_at: '2026-09-01' }),
      q('b', 'Apple', { source_class: BIO, progress: { percentage: 50 }, last_activity_at: '2026-08-01' }),
    ]
    expect(groupQuests(flipped, 'recent')[0].quests.map((x) => x.quests.title)).toEqual(['Zebra', 'Apple'])
    expect(groupQuests(flipped, 'name')[0].quests.map((x) => x.quests.title)).toEqual(['Apple', 'Zebra'])
    expect(groupQuests(flipped, 'progress')[0].quests.map((x) => x.quests.title)).toEqual(['Apple', 'Zebra'])
  })

  it('a quest with no source_class at all is Personal (older payloads)', () => {
    expect(groupQuests([q('x', 'Old')])[0].label).toBe('Personal')
  })

  it('reads progress from the home page shape too', () => {
    expect(questProgress({ completed_tasks: 1, quests: { task_count: 4 } })).toBe(25)
    expect(questProgress({ quests: {} })).toBe(0)
  })
})

describe('the snapshot', () => {
  it('shows each class as its own group, the left class labelled', () => {
    renderSnapshot()
    expect(screen.getByRole('region', { name: 'Biology' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Personal' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Elementary Art' }).textContent)
      .toMatch(/no longer in this class/)
  })

  it('the sort control reorders inside a group', () => {
    const quests = [
      q('a', 'Zebra', { source_class: BIO, progress: { percentage: 5 }, last_activity_at: '2026-09-01' }),
      q('b', 'Apple', { source_class: BIO, progress: { percentage: 50 }, last_activity_at: '2026-08-01' }),
    ]
    renderSnapshot({ activeQuests: quests })
    const order = () => within(screen.getByRole('region', { name: 'Biology' }))
      .getAllByRole('heading', { level: 4 }).slice(1).map((h) => h.textContent)
    expect(order()).toEqual(['Zebra', 'Apple'])
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'name' } })
    expect(order()).toEqual(['Apple', 'Zebra'])
  })

  it('the office removes a quest after confirming, and it leaves the list', async () => {
    api.delete.mockResolvedValue({ data: { success: true, removed: 1, set_down: 0, kept: 0, still_on_classes: [] } })
    renderSnapshot()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Finger paint' }))
    expect(await confirmText()).toMatch(/Completed tasks and the XP they earned are kept/)
    await answerConfirm()
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/api/advisor/student-overview/aj/quests/q-paint'))
    await waitFor(() => expect(screen.queryByText('Finger paint')).toBeNull())
    expect(screen.queryByRole('region', { name: 'Elementary Art' })).toBeNull()
  })

  it('cancelling removes nothing', async () => {
    renderSnapshot()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Finger paint' }))
    await answerConfirm(false)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.delete).not.toHaveBeenCalled()
    expect(screen.getByText('Finger paint')).toBeInTheDocument()
  })

  it('a teacher sees no Remove', () => {
    auth.value = { user: { id: 't-1' }, effectiveRoles: ['advisor'] }
    renderSnapshot()
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
  })

  it('a parent sees no Remove, even one who is also org staff', () => {
    renderSnapshot({ viewerMode: 'parent' })
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
  })

  it('nobody sees Remove on their own overview', () => {
    auth.value = { user: { id: 'aj' }, effectiveRoles: ['org_admin'] }
    renderSnapshot()
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
  })
})
