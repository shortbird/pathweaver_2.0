import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

/**
 * Training — getting the quest onto people's accounts, and building it from a
 * document instead of retyping it.
 *
 * iCreate, 2026-08-17, running family orientation and teacher training as
 * quests. Two things this page could not do:
 *
 *   1. The catalog only LISTED quests. Everyone had to go and find the quest and
 *      pick it up, so "required" was a label with nothing behind it.
 *   2. The builder was a blank form, while the orientation content already
 *      existed as a handbook.
 *
 * So what these tests hold down is that an admin can hand it a handbook, and
 * that the resulting quest actually lands on the accounts of the people who
 * have to do it — including the family who registers on Thursday.
 */

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('./SisOrgPicker', () => ({ default: () => null }))
vi.mock('./useSisOrg', () => ({
  // branding_config.logo_url is where an org's logo lives, and it is normally a
  // base64 data URI rather than a hosted file.
  useSisOrg: () => ({
    orgId: 'org-1', setOrgId: vi.fn(), orgs: [], isSuperadmin: false,
    activeOrg: { id: 'org-1', branding_config: { logo_url: 'data:image/png;base64,AAA' } },
  }),
  withOrg: (url, orgId) => `${url}${url.includes('?') ? '&' : '?'}organization_id=${orgId}`,
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-admin', role: 'org_admin' } }),
}))
vi.mock('./sisRole', () => ({ isSisAdmin: () => true }))
vi.mock('../../utils/appSurface', () => ({ switchSurfaceInApp: vi.fn() }))

const { api } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import { toast } from 'react-hot-toast'
import StaffTrainingPage from './StaffTrainingPage'

const ITEM = {
  id: 'tr-1', quest_id: 'q-1', title: 'Family orientation',
  description: 'Everything you need for the first week',
  category: 'Onboarding', is_required: true, auto_assign: true,
  sequence_order: 0, audience: 'family', visible_to_roles: null,
  my_progress: { started: false, completed: false, done: 0, total: 0 },
}

const mockGets = (training = [ITEM]) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/training/progress')) {
      return Promise.resolve({ data: { training: [], staff: [], required_total: 0 } })
    }
    if (url.includes('/training/assignable-quests')) {
      return Promise.resolve({ data: { quests: [{ quest_id: 'q-9', title: 'Existing quest', source: 'organization' }] } })
    }
    return Promise.resolve({ data: { training } })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGets()
  api.post.mockResolvedValue({ data: { enrolled: 3, already: 1, failed: 0, audience: 'family' } })
})

describe('assigning training to everyone', () => {
  it('puts the quest on every account when the admin presses assign', async () => {
    render(<StaffTrainingPage />)
    const btn = await screen.findByRole('button', { name: /assign to everyone/i })
    fireEvent.click(btn)

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url] = api.post.mock.calls[0]
    expect(url).toContain('/api/sis/training/tr-1/assign')
  })

  it('says how many people actually got it, and how many already had it', async () => {
    render(<StaffTrainingPage />)
    fireEvent.click(await screen.findByRole('button', { name: /assign to everyone/i }))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const msg = toast.success.mock.calls[0][0]
    // Counts are the whole point of the button: an admin re-presses it next week
    // to catch new families and needs to see whether anyone new was picked up.
    expect(msg).toMatch(/3 families/i)
    expect(msg).toMatch(/1 already/i)
  })

  it('gets the possessive right for each audience and count', async () => {
    // "2 families's accounts" shipped once. "families" already ends in s and
    // takes a bare apostrophe; "people" does not.
    const cases = [
      [{ enrolled: 2, already: 0, audience: 'family' }, "2 families' accounts"],
      [{ enrolled: 1, already: 0, audience: 'family' }, "1 family's account"],
      [{ enrolled: 3, already: 0, audience: 'staff' }, "3 people's accounts"],
      [{ enrolled: 1, already: 0, audience: 'staff' }, "1 person's account"],
    ]
    for (const [data, expected] of cases) {
      vi.clearAllMocks()
      mockGets()
      api.post.mockResolvedValue({ data })
      const view = render(<StaffTrainingPage />)
      fireEvent.click(await screen.findByRole('button', { name: /assign to everyone/i }))
      await waitFor(() => expect(toast.success).toHaveBeenCalled())
      expect(toast.success.mock.calls[0][0]).toContain(expected)
      view.unmount()
    }
  })

  it('reports the honest result when there is nobody to assign to yet', async () => {
    api.post.mockResolvedValue({ data: { enrolled: 0, already: 0, failed: 0 } })
    render(<StaffTrainingPage />)
    fireEvent.click(await screen.findByRole('button', { name: /assign to everyone/i }))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(toast.success.mock.calls[0][0]).toMatch(/nobody to assign/i)
  })

  it('shows which quests keep assigning themselves to new arrivals', async () => {
    render(<StaffTrainingPage />)
    expect(await screen.findByText(/auto-assigns to new staff/i)).toBeInTheDocument()
  })

  it('leaves the badge off a quest people opt into themselves', async () => {
    mockGets([{ ...ITEM, auto_assign: false }])
    render(<StaffTrainingPage />)
    await screen.findByText('Family orientation')
    expect(screen.queryByText(/auto-assigns to new/i)).not.toBeInTheDocument()
  })
})

describe('previewing the quest before committing to it', () => {
  // Previewed on the family side, since that is the audience whose quest an
  // admin has least ability to check by just opening it themselves.
  const openBuilder = async () => {
    render(<StaffTrainingPage />)
    fireEvent.click(await screen.findByRole('button', { name: /for families/i }))
    fireEvent.click(await screen.findByRole('button', { name: /add a family quest/i }))
    fireEvent.click(await screen.findByRole('button', { name: /build a new one/i }))
  }

  it('shows the draft the way the people doing it will meet it', async () => {
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Family orientation' },
    })
    fireEvent.change(screen.getByPlaceholderText(/what are families doing/i), {
      target: { value: 'Everything you need for week one' },
    })
    fireEvent.change(screen.getByPlaceholderText(/task 1 —/i), {
      target: { value: 'Read the handbook' },
    })
    fireEvent.click(screen.getByRole('button', { name: /preview quest/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Family orientation')).toBeInTheDocument()
    expect(within(dialog).getByText('Everything you need for week one')).toBeInTheDocument()
    expect(within(dialog).getByText('Read the handbook')).toBeInTheDocument()
  })

  it('names the audience it is previewing for', async () => {
    await openBuilder()
    fireEvent.click(screen.getByRole('button', { name: /preview quest/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/what families will see/i)).toBeInTheDocument()
  })

  it('shows the finish line the learner has to clear', async () => {
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/task 1 —/i), {
      target: { value: 'Read the handbook' },
    })
    fireEvent.change(screen.getByLabelText(/task 1 xp/i), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: /preview quest/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('200 XP needed to finish')).toBeInTheDocument()
  })

  it('warns when the finish line is higher than the quest is worth', async () => {
    // Catching an unfinishable quest here beats catching it when a parent
    // cannot close it.
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/task 1 —/i), {
      target: { value: 'Read the handbook' },
    })
    fireEvent.change(screen.getByLabelText(/task 1 xp/i), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText(/xp required to finish/i), {
      target: { value: '900' },
    })
    fireEvent.click(screen.getByRole('button', { name: /preview quest/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/could not be completed/i)).toBeInTheDocument()
  })

  it('closes on Escape like every other modal on the site', async () => {
    // Comes from the shared ui/Modal rather than being hand-rolled here, along
    // with the focus trap, the scroll lock and the backdrop.
    await openBuilder()
    fireEvent.click(screen.getByRole('button', { name: /preview quest/i }))
    await screen.findByRole('dialog')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes again to keep editing', async () => {
    await openBuilder()
    fireEvent.click(screen.getByRole('button', { name: /preview quest/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /back to editing/i }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('the header image', () => {
  const openBuilder = async () => {
    render(<StaffTrainingPage />)
    fireEvent.click(await screen.findByRole('button', { name: /add a family quest|add training/i }))
    fireEvent.click(await screen.findByRole('button', { name: /build a new one/i }))
  }

  const choose = async () => {
    const input = screen.getByLabelText(/upload a header image/i)
    const file = new File(['x'], 'welcome.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
  }

  it('uploads as soon as it is chosen, so the preview can show it', async () => {
    api.post.mockResolvedValue({ data: { url: 'https://s/storage/v1/object/public/quest-headers/x.png' } })
    await openBuilder()
    await choose()

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toContain('/api/sis/training/header-image')
  })

  it('sends the uploaded image with the new quest', async () => {
    const url = 'https://s/storage/v1/object/public/quest-headers/x.png'
    api.post.mockResolvedValue({ data: { url } })
    await openBuilder()
    await choose()
    await waitFor(() => expect(api.post).toHaveBeenCalled())

    api.post.mockResolvedValue({ data: { quest_id: 'q-new' } })
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Family orientation' },
    })
    fireEvent.click(screen.getByRole('button', { name: /build and add/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post.mock.calls[1][1].image_url).toBe(url)
  })

  it('is optional — without one the backend finds a stock image', async () => {
    api.post.mockResolvedValue({ data: { quest_id: 'q-new' } })
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Family orientation' },
    })
    fireEvent.click(screen.getByRole('button', { name: /build and add/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].image_url).toBeUndefined()
  })

  it('falls back to the school logo, so training looks like the school', async () => {
    await openBuilder()
    expect(screen.getByText(/your school logo is used unless you upload/i)).toBeInTheDocument()
  })

  it('refuses a file that is not an image', async () => {
    await openBuilder()
    const input = screen.getByLabelText(/upload a header image/i)
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'handbook.pdf', { type: 'application/pdf' })] },
    })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Choose an image file'))
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('saving a quest as a draft', () => {
  const openBuilder = async () => {
    render(<StaffTrainingPage />)
    fireEvent.click(await screen.findByRole('button', { name: /add a family quest|add training/i }))
    fireEvent.click(await screen.findByRole('button', { name: /build a new one/i }))
  }

  it('builds it without putting it on anybody', async () => {
    api.post.mockResolvedValue({ data: { quest_id: 'q-new', is_draft: true } })
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), { target: { value: 'Later' } })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].is_draft).toBe(true)
  })

  it('says plainly that nobody can see it yet', async () => {
    api.post.mockResolvedValue({ data: { quest_id: 'q-new', is_draft: true } })
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), { target: { value: 'Later' } })
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(toast.success.mock.calls[0][0]).toMatch(/nobody can see it until you publish/i)
  })

  it('still publishes immediately with the other button', async () => {
    api.post.mockResolvedValue({ data: { quest_id: 'q-new' } })
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), { target: { value: 'Now' } })
    fireEvent.click(screen.getByRole('button', { name: /build and add/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].is_draft).toBe(false)
  })

  it('marks a draft in the list and offers to publish it', async () => {
    mockGets([{ ...ITEM, is_draft: true }])
    render(<StaffTrainingPage />)
    expect(await screen.findByText('Draft')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeInTheDocument()
  })

  it('replaces bulk assign with publish, since a draft is on nobody', async () => {
    mockGets([{ ...ITEM, is_draft: true }])
    render(<StaffTrainingPage />)
    await screen.findByText('Draft')
    expect(screen.queryByRole('button', { name: /assign to everyone/i })).not.toBeInTheDocument()
  })

  it('can still be handed to specific people, and can be reopened', async () => {
    // The two things a draft is for: more work on it, and a small rollout.
    mockGets([{ ...ITEM, is_draft: true, quest_is_ours: true }])
    render(<StaffTrainingPage />)
    await screen.findByText('Draft')
    expect(screen.getByRole('button', { name: /choose people/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
  })

  it('publishes on request', async () => {
    mockGets([{ ...ITEM, is_draft: true }])
    api.post.mockResolvedValue({ data: { assigned: { enrolled: 5, already: 0 }, audience: 'family' } })
    render(<StaffTrainingPage />)
    fireEvent.click(await screen.findByRole('button', { name: /^publish$/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toContain('/api/sis/training/tr-1/publish')
  })
})

describe('reopening a quest for more editing', () => {
  const QUEST = {
    quest_id: 'q-1', title: 'Family orientation', description: 'Week one',
    image_url: '', xp_threshold: 300, allow_custom_tasks: true,
    is_draft: true, quest_is_ours: true,
    tasks: [{ title: 'Read the handbook', pillar: 'art', xp_value: 150, is_required: true }],
  }
  const TRAINING = { category: 'Onboarding', is_required: true, auto_assign: true,
    visible_to_roles: null, audience: 'family' }

  const openEditor = async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/quest')) return Promise.resolve({ data: { quest: QUEST, training: TRAINING } })
      if (url.includes('/training/progress')) {
        return Promise.resolve({ data: { training: [], staff: [], required_total: 0 } })
      }
      if (url.includes('/assignable-quests')) return Promise.resolve({ data: { quests: [] } })
      return Promise.resolve({ data: { training: [{ ...ITEM, is_draft: true, quest_is_ours: true }] } })
    })
    render(<StaffTrainingPage />)
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }))
  }

  it('loads what was already built back into the form', async () => {
    await openEditor()
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/quest title/i)).toHaveValue('Family orientation'))
    expect(screen.getByPlaceholderText(/task 1 —/i)).toHaveValue('Read the handbook')
    expect(screen.getByLabelText(/task 1 xp/i)).toHaveValue(150)
  })

  it('keeps the finish line that was already decided', async () => {
    // Reopening must not silently move it back to the task total. Matched
    // exactly: the list row carries its own "XP required to finish <title>".
    await openEditor()
    await waitFor(() =>
      expect(screen.getByLabelText('XP required to finish')).toHaveValue(300))
  })

  it('restores the catalog settings too', async () => {
    await openEditor()
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/category/i)).toHaveValue('Onboarding'))
    expect(screen.getByRole('checkbox', { name: /let them add tasks of their own/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /put it on their accounts/i })).toBeChecked()
  })

  it('saves the changes back to the same quest', async () => {
    api.put = vi.fn(() => Promise.resolve({ data: { success: true } }))
    await openEditor()
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/quest title/i)).toHaveValue('Family orientation'))
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Family orientation 2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const [url, body] = api.put.mock.calls[0]
    expect(url).toContain('/api/sis/training/tr-1/quest')
    expect(body.title).toBe('Family orientation 2026')
    expect(body.tasks).toHaveLength(1)
  })

  it('does not offer to rebuild it from a document', async () => {
    // Reopening is about changing the details. A panel whose job is to
    // overwrite the whole form is the last thing wanted there.
    await openEditor()
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/quest title/i)).toHaveValue('Family orientation'))
    expect(screen.queryByLabelText(/upload a document/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate draft/i })).not.toBeInTheDocument()
  })

  it('does not offer to edit a shared Optio library quest', async () => {
    mockGets([{ ...ITEM, quest_is_ours: false }])
    render(<StaffTrainingPage />)
    await screen.findByText('Family orientation')
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
  })
})

describe('choosing specific people', () => {
  const PEOPLE = [
    { user_id: 'u1', name: 'Molly Christensen', email: 'molly@example.com',
      progress: { started: false, completed: false } },
    { user_id: 'u2', name: 'Marika Connole', email: 'marika@example.com',
      progress: { started: true, completed: false } },
  ]

  const openPicker = async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/people')) return Promise.resolve({ data: { people: PEOPLE } })
      if (url.includes('/training/progress')) {
        return Promise.resolve({ data: { training: [], staff: [], required_total: 0 } })
      }
      if (url.includes('/assignable-quests')) return Promise.resolve({ data: { quests: [] } })
      return Promise.resolve({ data: { training: [ITEM] } })
    })
    render(<StaffTrainingPage />)
    fireEvent.click(await screen.findByRole('button', { name: /choose people/i }))
    return screen.findByRole('dialog')
  }

  it('lists the people this training applies to, with who already has it', async () => {
    const dialog = await openPicker()
    expect(within(dialog).getByText('Molly Christensen')).toBeInTheDocument()
    expect(within(dialog).getByText('Marika Connole')).toBeInTheDocument()
    expect(within(dialog).getByText('Not started')).toBeInTheDocument()
    expect(within(dialog).getByText('Has it')).toBeInTheDocument()
  })

  it('assigns only the people who were ticked', async () => {
    const dialog = await openPicker()
    fireEvent.click(within(dialog).getByLabelText(/select molly christensen/i))
    fireEvent.click(within(dialog).getByRole('button', { name: /assign to selected/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toContain('/api/sis/training/tr-1/assign')
    expect(body).toEqual({ user_ids: ['u1'] })
  })

  it('will not assign to nobody', async () => {
    const dialog = await openPicker()
    expect(within(dialog).getByRole('button', { name: /assign to selected/i })).toBeDisabled()
  })

  it('can select everyone who has not started, which is the usual job', async () => {
    const dialog = await openPicker()
    fireEvent.click(within(dialog).getByRole('button', { name: /select not started/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /assign to selected/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1]).toEqual({ user_ids: ['u1'] })
  })

  it('filters the list by name or email', async () => {
    const dialog = await openPicker()
    fireEvent.change(within(dialog).getByLabelText(/search people/i), {
      target: { value: 'marika' },
    })
    expect(within(dialog).queryByText('Molly Christensen')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Marika Connole')).toBeInTheDocument()
  })
})

describe('the XP finish line on the list', () => {
  it('shows how much XP has been earned against what is needed', async () => {
    mockGets([{ ...ITEM, xp_threshold: 300, quest_is_ours: true,
      my_progress: { started: true, completed: false, done: 1, total: 4, earned_xp: 150 } }])
    render(<StaffTrainingPage />)
    expect(await screen.findByText('150 of 300 XP')).toBeInTheDocument()
  })

  it('says nothing about XP when no finish line is set', async () => {
    mockGets([{ ...ITEM, xp_threshold: 0 }])
    render(<StaffTrainingPage />)
    await screen.findByText('Family orientation')
    expect(screen.queryByText(/of 0 XP/i)).not.toBeInTheDocument()
  })

  it('lets an admin move the finish line without rebuilding the quest', async () => {
    api.patch = vi.fn(() => Promise.resolve({ data: { success: true } }))
    mockGets([{ ...ITEM, xp_threshold: 300, quest_is_ours: true }])
    render(<StaffTrainingPage />)
    const field = await screen.findByLabelText(/xp required to finish family orientation/i)
    fireEvent.blur(field, { target: { value: '500' } })

    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const [url, body] = api.patch.mock.calls[0]
    expect(url).toContain('/api/sis/training/tr-1')
    expect(body).toEqual({ xp_threshold: 500 })
  })

  it('offers no edit for a shared Optio library quest', async () => {
    // Its finish line belongs to every school using it, not this one.
    mockGets([{ ...ITEM, xp_threshold: 300, quest_is_ours: false }])
    render(<StaffTrainingPage />)
    await screen.findByText('Family orientation')
    expect(screen.queryByLabelText(/xp required to finish family orientation/i)).not.toBeInTheDocument()
  })
})

describe('building a training quest', () => {
  const openBuilder = async () => {
    render(<StaffTrainingPage />)
    fireEvent.click(await screen.findByRole('button', { name: /add a family quest|add training/i }))
    fireEvent.click(await screen.findByRole('button', { name: /build a new one/i }))
  }

  it('offers the document upload, so a handbook does not have to be retyped', async () => {
    await openBuilder()
    expect(await screen.findByLabelText(/upload a document/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate draft/i })).toBeInTheDocument()
  })

  it('asks for the quest to be put on their accounts by default', async () => {
    await openBuilder()
    const box = await screen.findByRole('checkbox', { name: /put it on their accounts/i })
    expect(box).toBeChecked()
  })

  it('sends auto_assign with the new quest', async () => {
    api.post.mockResolvedValue({ data: { quest_id: 'q-new', assigned: { enrolled: 2, already: 0 } } })
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Family orientation' },
    })
    fireEvent.click(screen.getByRole('button', { name: /build and add/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/training/create')
    expect(body.auto_assign).toBe(true)
    expect(body.title).toBe('Family orientation')
  })

  it('lets an admin choose which pillar a task grows', async () => {
    // This used to assert the opposite. The pillar chip is genuinely noise on a
    // staff handbook, so the LEARNER's page still hides it (QuestDetail reads
    // quest.is_training) — but hiding the control here did not remove the
    // pillar, it silently kept blankTask()'s default. Ten of iCreate's sixteen
    // orientation tasks went in as Art, "Find the Absences feature in Optio"
    // among them, and that is the pillar their XP landed in. An admin editing
    // the quest has to be able to reach it.
    await openBuilder()
    await screen.findByPlaceholderText(/quest title/i)
    expect(screen.getByLabelText(/task 1 pillar/i)).toBeInTheDocument()
  })

  it('still asks for XP per task, which is what the finish line counts', async () => {
    await openBuilder()
    expect(await screen.findByLabelText(/task 1 xp/i)).toBeInTheDocument()
  })

  it('defaults the finish line to every task the quest is worth', async () => {
    // "Do all of it" is what training means, and it saves an admin adding the
    // task XP up by hand.
    await openBuilder()
    fireEvent.change(await screen.findByPlaceholderText(/task 1 —/i), {
      target: { value: 'Read the handbook' },
    })
    fireEvent.change(screen.getByLabelText(/task 1 xp/i), { target: { value: '150' } })

    await waitFor(() =>
      expect(screen.getByLabelText(/xp required to finish/i)).toHaveValue(150))
  })

  it('follows the tasks as they change, until an admin sets their own number', async () => {
    await openBuilder()
    fireEvent.change(await screen.findByPlaceholderText(/task 1 —/i), {
      target: { value: 'Read the handbook' },
    })
    fireEvent.change(screen.getByLabelText(/task 1 xp/i), { target: { value: '100' } })
    await waitFor(() =>
      expect(screen.getByLabelText(/xp required to finish/i)).toHaveValue(100))

    // Once they type their own, the tasks must stop moving it underneath them.
    fireEvent.change(screen.getByLabelText(/xp required to finish/i), {
      target: { value: '50' },
    })
    fireEvent.change(screen.getByLabelText(/task 1 xp/i), { target: { value: '400' } })
    expect(screen.getByLabelText(/xp required to finish/i)).toHaveValue(50)
  })

  it('can be handed back to the tasks after an override', async () => {
    await openBuilder()
    fireEvent.change(await screen.findByPlaceholderText(/task 1 —/i), {
      target: { value: 'Read the handbook' },
    })
    fireEvent.change(screen.getByLabelText(/task 1 xp/i), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText(/xp required to finish/i), {
      target: { value: '50' },
    })
    fireEvent.click(screen.getByRole('button', { name: /use all 200/i }))
    expect(screen.getByLabelText(/xp required to finish/i)).toHaveValue(200)
  })

  it('sends the XP finish line with the new quest', async () => {
    api.post.mockResolvedValue({ data: { quest_id: 'q-new' } })
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Family orientation' },
    })
    fireEvent.change(screen.getByLabelText(/xp required to finish/i), {
      target: { value: '300' },
    })
    fireEvent.click(screen.getByRole('button', { name: /build and add/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].xp_threshold).toBe(300)
  })

  it('sends no finish line when the field is left blank', async () => {
    api.post.mockResolvedValue({ data: { quest_id: 'q-new' } })
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Optional course' },
    })
    fireEvent.click(screen.getByRole('button', { name: /build and add/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].xp_threshold).toBeNull()
  })

  it('does not let people write their own tasks unless asked', async () => {
    // Training is a set list of things the school needs done.
    api.post.mockResolvedValue({ data: { quest_id: 'q-new' } })
    await openBuilder()
    const box = screen.getByRole('checkbox', { name: /let them add tasks of their own/i })
    expect(box).not.toBeChecked()

    fireEvent.change(screen.getByPlaceholderText(/quest title/i), { target: { value: 'T' } })
    fireEvent.click(screen.getByRole('button', { name: /build and add/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].allow_custom_tasks).toBe(false)
  })

  it('lets learners generate against the uploaded document when turned on', async () => {
    api.post.mockResolvedValue({ data: { quest_id: 'q-new' } })
    await openBuilder()
    fireEvent.click(screen.getByRole('checkbox', { name: /let them add tasks of their own/i }))
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), { target: { value: 'T' } })
    fireEvent.click(screen.getByRole('button', { name: /build and add/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].allow_custom_tasks).toBe(true)
  })

  it('can be unticked for training people opt into', async () => {
    api.post.mockResolvedValue({ data: { quest_id: 'q-new' } })
    await openBuilder()
    fireEvent.click(screen.getByRole('checkbox', { name: /put it on their accounts/i }))
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Optional course' },
    })
    fireEvent.click(screen.getByRole('button', { name: /build and add/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].auto_assign).toBe(false)
  })
})
