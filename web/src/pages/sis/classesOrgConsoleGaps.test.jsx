/**
 * Class features the organization console had and the SIS console did not
 * (2026-10-15: every org is an SIS org, and the console is being retired).
 *
 *   - the class XP goal (org_classes.xp_threshold), which drives a student's
 *     "class complete" percentage;
 *   - the class invite link (create, copy, reset) on the class record;
 *   - "Register a Student" on the Optio courses tab, to /enroll-students.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClassForm from '../../components/sis/ClassForm'
import ClassDetailModal from './classesPage/ClassDetailModal'
import { toDraft, draftToPayload } from '../../components/sis/classFields'

const { classService } = vi.hoisted(() => ({
  classService: { createClassInviteLink: vi.fn() },
}))
vi.mock('../../services/classService', () => ({ default: classService }))
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))
vi.mock('./classesPage/ClassRoster', () => ({ default: () => <p>Roster list</p> }))
vi.mock('./classesPage/ClassWaitlist', () => ({ default: () => null }))

const POTTERY = {
  id: 'c1', name: 'Pottery', registration_status: 'open', status: 'active',
  meetings: [], xp_threshold: 250,
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('the class XP goal', () => {
  it('reads the saved goal into the form and sends it back as a number', () => {
    const draft = toDraft(POTTERY)
    expect(draft.xp_threshold).toBe('250')
    expect(draftToPayload({ ...draft, xp_threshold: '400' }).xp_threshold).toBe(400)
  })

  it('a blank goal is left out, never sent as null (the column is NOT NULL)', () => {
    const payload = draftToPayload(toDraft({ name: 'New' }))
    expect('xp_threshold' in payload ? payload.xp_threshold : undefined).toBeUndefined()
    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty('xp_threshold')
  })

  it('0 is a real goal: the class never completes on XP', () => {
    expect(draftToPayload({ ...toDraft(POTTERY), xp_threshold: '0' }).xp_threshold).toBe(0)
  })

  it('the form edits it and saves it', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ClassForm initial={POTTERY} onSubmit={onSubmit} />)
    const field = screen.getByLabelText('XP to complete the class')
    expect(field).toHaveValue(250)
    fireEvent.change(field, { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].xp_threshold).toBe(500)
  })
})

describe('the class invite link', () => {
  const mount = (cls = POTTERY) => render(
    <MemoryRouter>
      <ClassDetailModal cls={cls} staff={[]} orgId="org-1" initialTab="roster"
        onClose={vi.fn()} onSubmit={vi.fn()} onToggleRegistration={vi.fn()}
        onArchive={vi.fn()} onRestore={vi.fn()} onRosterChanged={vi.fn()} />
    </MemoryRouter>,
  )

  it('sits on the roster tab, and gets, shows and copies the link', async () => {
    classService.createClassInviteLink.mockResolvedValue({
      success: true, link: 'https://app.optioeducation.com/invitation/abc',
    })
    mount()
    expect(screen.getByText('Roster list')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Invite link/ }))
    await waitFor(() => expect(classService.createClassInviteLink).toHaveBeenCalledWith('org-1', 'c1'))
    expect(await screen.findByDisplayValue('https://app.optioeducation.com/invitation/abc')).toBeInTheDocument()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://app.optioeducation.com/invitation/abc')
  })

  it('resets the link on request', async () => {
    classService.createClassInviteLink
      .mockResolvedValueOnce({ success: true, link: 'https://x/invitation/old' })
      .mockResolvedValueOnce({ success: true, link: 'https://x/invitation/new' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Invite link/ }))
    await screen.findByDisplayValue('https://x/invitation/old')
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }))
    expect(await screen.findByDisplayValue('https://x/invitation/new')).toBeInTheDocument()
    expect(classService.createClassInviteLink).toHaveBeenLastCalledWith('org-1', 'c1', { rotate: true })
  })

  it('is not offered for an archived class (the backend refuses one)', () => {
    mount({ ...POTTERY, status: 'archived' })
    expect(screen.getByText('Roster list')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Invite link/ })).toBeNull()
  })
})
