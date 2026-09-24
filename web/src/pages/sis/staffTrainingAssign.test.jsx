import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { withConfirm, confirmText } from '../../tests/confirmTestUtils'

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
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), put: vi.fn(), patch: vi.fn() },
}))
vi.mock('../../services/api', () => ({ default: api }))

import { toast } from 'react-hot-toast'
import TrainingPanel from './libraryPage/TrainingPanel'

// The page reads its training links through hooks/api, so it needs a
// QueryClient. A fresh client per render keeps one test's cache out of the
// next one's, and retry:false makes a failed query fail rather than hang.
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

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


// The quest editor (P6, 2026-09-23) behind "Build a new one" and Edit: a
// draft exists from the first click (POST /quest-editor/drafts, filed in the
// catalog as tr-new), the form saves through PUT /quest-editor/<id>, the
// catalog settings through PATCH /training/<id>, and Publish is the catalog's
// own POST /training/<id>/publish.
const HEADER_URL = 'https://s/storage/v1/object/public/quest-headers/x.png'
const blankDraft = {
  id: 'q-new', title: '', description: '', header_image_url: '', is_draft: true, is_active: false,
  editable: true, can_lock_xp: true, tasks: [], xp_threshold: 0, allow_custom_tasks: false,
  teachers_may_change_xp: true,
}
const editorBackend = ({ quest = blankDraft, training = { audience: 'family', audiences: ['family'], auto_assign: true } } = {}) => {
  const base = api.get.getMockImplementation()
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/sis/quest-editor/')) return Promise.resolve({ data: { quest } })
    if (url.includes('/resources')) return Promise.resolve({ data: { quest: [], by_task: {} } })
    if (/\/api\/sis\/training\/[^/?]+\/quest/.test(url)) return Promise.resolve({ data: { training } })
    return base(url)
  })
  api.post.mockImplementation((url) => {
    if (url.startsWith('/api/sis/quest-editor/drafts')) {
      return Promise.resolve({ data: { quest_id: 'q-new', training_id: 'tr-new' } })
    }
    if (url.includes('/header-image')) return Promise.resolve({ data: { header_image_url: HEADER_URL } })
    return Promise.resolve({ data: { success: true, assigned: { enrolled: 2, already: 0 } } })
  })
  api.put.mockImplementation((url, body) => Promise.resolve({ data: { quest: {
    ...quest, ...body, tasks: (body.tasks || []).map((t, i) => ({ id: t.id || `t${i}`, ...t })) } } }))
  api.patch.mockResolvedValue({ data: { success: true } })
  api.delete.mockResolvedValue({ data: { success: true, discarded: false } })
}
const putBody = () => api.put.mock.calls.at(-1)?.[1]
const patchBody = () => api.patch.mock.calls.at(-1)?.[1]
const posted = (fragment) => api.post.mock.calls.filter(([url]) => url.includes(fragment))

beforeEach(() => {
  vi.clearAllMocks()
  mockGets()
  api.post.mockResolvedValue({ data: { enrolled: 3, already: 1, failed: 0, audience: 'family' } })
})

describe('assigning training to everyone', () => {
  it('puts the quest on every account when the admin presses assign', async () => {
    render(<TrainingPanel />)
    const btn = await screen.findByRole('button', { name: /assign to everyone/i })
    fireEvent.click(btn)

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url] = api.post.mock.calls[0]
    expect(url).toContain('/api/sis/training/tr-1/assign')
  })

  it('says how many people actually got it, and how many already had it', async () => {
    render(<TrainingPanel />)
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
      const view = render(<TrainingPanel />)
      fireEvent.click(await screen.findByRole('button', { name: /assign to everyone/i }))
      await waitFor(() => expect(toast.success).toHaveBeenCalled())
      expect(toast.success.mock.calls[0][0]).toContain(expected)
      view.unmount()
    }
  })

  it('reports the honest result when there is nobody to assign to yet', async () => {
    api.post.mockResolvedValue({ data: { enrolled: 0, already: 0, failed: 0 } })
    render(<TrainingPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /assign to everyone/i }))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(toast.success.mock.calls[0][0]).toMatch(/nobody to assign/i)
  })

  it('shows which quests keep assigning themselves to new arrivals', async () => {
    render(<TrainingPanel />)
    expect(await screen.findByText(/auto-assigns to new staff/i)).toBeInTheDocument()
  })

  it('leaves the badge off a quest people opt into themselves', async () => {
    mockGets([{ ...ITEM, auto_assign: false }])
    render(<TrainingPanel />)
    await screen.findByText('Family orientation')
    expect(screen.queryByText(/auto-assigns to new/i)).not.toBeInTheDocument()
  })
})

describe('previewing the quest before committing to it', () => {
  // Previewed on the family side, since that is the audience whose quest an
  // admin has least ability to check by just opening it themselves.
  const openBuilder = async () => {
    editorBackend()
    render(<TrainingPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /for families/i }))
    fireEvent.click(await screen.findByRole('button', { name: /add a family quest/i }))
    fireEvent.click(await screen.findByRole('tab', { name: /build a new one/i }))
    await screen.findByPlaceholderText(/quest title/i)
  }
  const preview = async () => {
    fireEvent.click(screen.getByRole('button', { name: /preview quest/i }))
    await screen.findByText(/what families will see/i)
    const dialogs = screen.getAllByRole('dialog')
    return dialogs[dialogs.length - 1]
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
    const dialog = await preview()
    expect(within(dialog).getByText('Family orientation')).toBeInTheDocument()
    expect(within(dialog).getByText('Everything you need for week one')).toBeInTheDocument()
    expect(within(dialog).getByText('Read the handbook')).toBeInTheDocument()
  })

  it('names the audience it is previewing for', async () => {
    await openBuilder()
    const dialog = await preview()
    expect(within(dialog).getByText(/what families will see/i)).toBeInTheDocument()
  })

  it('shows the finish line the learner has to clear', async () => {
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/task 1 —/i), {
      target: { value: 'Read the handbook' },
    })
    fireEvent.change(screen.getByLabelText(/task 1 xp/i), { target: { value: '200' } })
    const dialog = await preview()
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
    const dialog = await preview()
    expect(within(dialog).getByText(/could not be completed/i)).toBeInTheDocument()
  })

  it('closes on Escape, and only the preview closes', async () => {
    // The preview sits over the quest editor; Escape must not take the quest
    // with it.
    await openBuilder()
    await preview()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText(/what families will see/i)).not.toBeInTheDocument())
    expect(screen.getByPlaceholderText(/quest title/i)).toBeInTheDocument()
  })

  it('closes again to keep editing', async () => {
    await openBuilder()
    const dialog = await preview()
    fireEvent.click(within(dialog).getByRole('button', { name: /back to editing/i }))
    await waitFor(() => expect(screen.queryByText(/what families will see/i)).not.toBeInTheDocument())
    expect(screen.getByPlaceholderText(/quest title/i)).toBeInTheDocument()
  })
})

describe('the header image', () => {
  const openBuilder = async () => {
    editorBackend()
    render(<TrainingPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /add a family quest|add training/i }))
    fireEvent.click(await screen.findByRole('tab', { name: /build a new one/i }))
    await screen.findByPlaceholderText(/quest title/i)
  }

  const choose = () => {
    const input = screen.getByLabelText(/upload a header image/i)
    const file = new File(['x'], 'welcome.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
  }

  it('goes straight onto the quest as soon as it is chosen', async () => {
    // The quest exists from the first click, so there is nothing to hold the
    // picture for: it is uploaded to the quest itself.
    await openBuilder()
    choose()
    await waitFor(() => expect(posted('/header-image')).toHaveLength(1))
    expect(posted('/header-image')[0][0]).toContain('/api/sis/quest-editor/q-new/header-image')
    await waitFor(() => expect(document.querySelector(`img[src="${HEADER_URL}"]`)).toBeTruthy())
  })

  it('is optional — without one the catalog finds the logo or a stock image', async () => {
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Family orientation' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }))
    await waitFor(() => expect(posted('/training/tr-new/publish')).toHaveLength(1))
    expect(posted('/header-image')).toHaveLength(0)
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
    expect(posted('/header-image')).toHaveLength(0)
  })
})

describe('saving a quest as a draft', () => {
  const openBuilder = async () => {
    editorBackend()
    render(<TrainingPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /add a family quest|add training/i }))
    fireEvent.click(await screen.findByRole('tab', { name: /build a new one/i }))
    await screen.findByPlaceholderText(/quest title/i)
  }

  it('builds it without putting it on anybody', async () => {
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), { target: { value: 'Later' } })
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(putBody().title).toBe('Later')
    expect(posted('/publish')).toHaveLength(0)
  })

  it('says plainly that nobody can see it yet', async () => {
    await openBuilder()
    expect(screen.getByText(/nobody else sees it until you publish it/i)).toBeInTheDocument()
  })

  it('publishes with the other button', async () => {
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), { target: { value: 'Now' } })
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }))

    await waitFor(() => expect(posted('/training/tr-new/publish')).toHaveLength(1))
  })

  it('marks a draft in the list and offers to publish it, saying who it goes to', async () => {
    // Built with "Put it on their accounts": the button says so (ticket be12106a).
    mockGets([{ ...ITEM, is_draft: true }])
    render(<TrainingPanel />)
    expect(await screen.findByText('Draft')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^publish to everyone$/i })).toBeInTheDocument()
  })

  it('a draft built to be found says plain Publish', async () => {
    mockGets([{ ...ITEM, is_draft: true, auto_assign: false }])
    render(<TrainingPanel />)
    await screen.findByText('Draft')
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeInTheDocument()
  })

  it('replaces bulk assign with publish, since a draft is on nobody', async () => {
    mockGets([{ ...ITEM, is_draft: true }])
    render(<TrainingPanel />)
    await screen.findByText('Draft')
    expect(screen.queryByRole('button', { name: /assign to everyone/i })).not.toBeInTheDocument()
  })

  it('can still be handed to specific people, and can be reopened', async () => {
    // The two things a draft is for: more work on it, and a small rollout.
    mockGets([{ ...ITEM, is_draft: true, quest_is_ours: true }])
    render(<TrainingPanel />)
    await screen.findByText('Draft')
    expect(screen.getByRole('button', { name: /choose people/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
  })

  it('publishes a draft built to be found on request, asking nothing', async () => {
    mockGets([{ ...ITEM, is_draft: true, auto_assign: false }])
    api.post.mockResolvedValue({ data: { assigned: null, audience: 'family' } })
    render(withConfirm(<TrainingPanel />))
    fireEvent.click(await screen.findByRole('button', { name: /^publish$/i }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toContain('/api/sis/training/tr-1/publish')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says the number before publishing puts it on their accounts', async () => {
    // Ticket be12106a: publishing enrolled everyone and nothing said so. The
    // same people the picker lists are counted and named before it happens.
    mockGets([{ ...ITEM, is_draft: true }])
    api.get.mockImplementation((url) => {
      if (url.includes('/training/tr-1/people')) {
        return Promise.resolve({ data: { people: [{ user_id: 'p1' }, { user_id: 'p2' }, { user_id: 'p3' }] } })
      }
      if (url.includes('/training/progress')) {
        return Promise.resolve({ data: { training: [], staff: [], required_total: 0 } })
      }
      return Promise.resolve({ data: { training: [{ ...ITEM, is_draft: true }] } })
    })
    api.post.mockResolvedValue({ data: { assigned: { enrolled: 3, already: 0 }, audience: 'family' } })
    render(withConfirm(<TrainingPanel />))
    fireEvent.click(await screen.findByRole('button', { name: /^publish to everyone$/i }))

    expect(await confirmText()).toMatch(/put it on 3 families' accounts/i)
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.post).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^publish to everyone$/i }))
    await confirmText()
    fireEvent.click(screen.getByRole('button', { name: 'Publish to 3 families' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toContain('/api/sis/training/tr-1/publish')
  })
})

describe('reopening a quest for more editing', () => {
  const QUEST = {
    ...blankDraft, id: 'q-1', title: 'Family orientation', description: 'Week one',
    xp_threshold: 300, allow_custom_tasks: true,
    tasks: [{ id: 'tk-1', title: 'Read the handbook', pillar: 'art', xp_value: 150, is_required: true,
      diploma_subjects: [], subject_xp_distribution: {} }],
  }
  const TRAINING = { category: 'Onboarding', is_required: true, auto_assign: true,
    visible_to_roles: null, audience: 'family', audiences: ['family'] }

  const openEditor = async () => {
    mockGets([{ ...ITEM, is_draft: true, quest_is_ours: true }])
    editorBackend({ quest: QUEST, training: TRAINING })
    render(<TrainingPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /^edit$/i }))
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/quest title/i)).toHaveValue('Family orientation'))
  }

  it('loads what was already built back into the form', async () => {
    await openEditor()
    expect(api.get).toHaveBeenCalledWith('/api/sis/quest-editor/q-1?organization_id=org-1')
    expect(screen.getByPlaceholderText(/task 1 —/i)).toHaveValue('Read the handbook')
    expect(screen.getByLabelText(/task 1 xp/i)).toHaveValue(150)
    // Reopening starts nothing new.
    expect(posted('/quest-editor/drafts')).toHaveLength(0)
  })

  it('keeps the finish line that was already decided', async () => {
    // Reopening must not silently move it back to the task total. Matched
    // exactly: the list row carries its own "XP required to finish <title>".
    await openEditor()
    expect(screen.getByLabelText('XP required to finish (optional)')).toHaveValue(300)
  })

  it('restores the catalog settings too', async () => {
    await openEditor()
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/category/i)).toHaveValue('Onboarding'))
    expect(screen.getByRole('checkbox', { name: /let them add tasks of their own/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /put it on their accounts/i })).toBeChecked()
  })

  it('saves the changes back to the same quest, tasks by id', async () => {
    await openEditor()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Family orientation 2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const [url, body] = api.put.mock.calls[0]
    expect(url).toContain('/api/sis/quest-editor/q-1')
    expect(body.title).toBe('Family orientation 2026')
    expect(body.tasks).toEqual([expect.objectContaining({ id: 'tk-1', title: 'Read the handbook' })])
    // ...and who it is for, on the catalog row.
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][0]).toContain('/api/sis/training/tr-1')
    expect(patchBody().category).toBe('Onboarding')
  })

  it('keeps the document panel folded away, so it cannot overwrite the quest by accident', async () => {
    await openEditor()
    expect(screen.queryByLabelText(/upload a document/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate draft/i })).not.toBeInTheDocument()
  })

  it('does not offer to edit a shared Optio library quest', async () => {
    mockGets([{ ...ITEM, quest_is_ours: false }])
    render(<TrainingPanel />)
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
    render(<TrainingPanel />)
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
    render(<TrainingPanel />)
    expect(await screen.findByText('150 of 300 XP')).toBeInTheDocument()
  })

  it('says nothing about XP when no finish line is set', async () => {
    mockGets([{ ...ITEM, xp_threshold: 0 }])
    render(<TrainingPanel />)
    await screen.findByText('Family orientation')
    expect(screen.queryByText(/of 0 XP/i)).not.toBeInTheDocument()
  })

  it('lets an admin move the finish line without rebuilding the quest', async () => {
    api.patch = vi.fn(() => Promise.resolve({ data: { success: true } }))
    mockGets([{ ...ITEM, xp_threshold: 300, quest_is_ours: true }])
    render(<TrainingPanel />)
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
    render(<TrainingPanel />)
    await screen.findByText('Family orientation')
    expect(screen.queryByLabelText(/xp required to finish family orientation/i)).not.toBeInTheDocument()
  })
})

describe('building a training quest', () => {
  const openBuilder = async () => {
    editorBackend()
    render(<TrainingPanel />)
    fireEvent.click(await screen.findByRole('button', { name: /add a family quest|add training/i }))
    fireEvent.click(await screen.findByRole('tab', { name: /build a new one/i }))
    await screen.findByPlaceholderText(/quest title/i)
  }
  const publish = async () => {
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }))
    await waitFor(() => expect(posted('/publish')).toHaveLength(1))
  }

  it('starts the draft in the catalog for the tab it was opened from', async () => {
    await openBuilder()
    expect(posted('/quest-editor/drafts')[0][1]).toEqual({ context: 'training', audience: 'staff' })
  })

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

  it('files auto_assign on the catalog row before publishing', async () => {
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Family orientation' },
    })
    await publish()
    expect(patchBody().auto_assign).toBe(true)
    expect(putBody().title).toBe('Family orientation')
    // The catalog row is written before the publish that reads it.
    const patchAt = api.patch.mock.invocationCallOrder[0]
    const publishAt = api.post.mock.invocationCallOrder[api.post.mock.calls.findIndex(([u]) => u.includes('/publish'))]
    expect(patchAt).toBeLessThan(publishAt)
  })

  it('lets an admin choose which pillar a task grows', async () => {
    // The learner's page hides the pillar chip on a training quest, but the
    // stored value decides where the XP lands, so the admin must reach it.
    await openBuilder()
    expect(screen.getByLabelText(/task 1 pillar/i)).toBeInTheDocument()
  })

  it('still asks for XP per task, which is what the finish line counts', async () => {
    await openBuilder()
    expect(await screen.findByLabelText(/task 1 xp/i)).toBeInTheDocument()
  })

  it('defaults the finish line to every task the quest is worth', async () => {
    // "Do all of it" is what training means.
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/task 1 —/i), {
      target: { value: 'Read the handbook' },
    })
    fireEvent.change(screen.getByLabelText(/task 1 xp/i), { target: { value: '150' } })
    await waitFor(() =>
      expect(screen.getByLabelText(/xp required to finish/i)).toHaveValue(150))
  })

  it('follows the tasks as they change, until an admin sets their own number', async () => {
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/task 1 —/i), {
      target: { value: 'Read the handbook' },
    })
    fireEvent.change(screen.getByLabelText(/task 1 xp/i), { target: { value: '100' } })
    await waitFor(() =>
      expect(screen.getByLabelText(/xp required to finish/i)).toHaveValue(100))

    fireEvent.change(screen.getByLabelText(/xp required to finish/i), {
      target: { value: '50' },
    })
    fireEvent.change(screen.getByLabelText(/task 1 xp/i), { target: { value: '400' } })
    expect(screen.getByLabelText(/xp required to finish/i)).toHaveValue(50)
  })

  it('can be handed back to the tasks after an override', async () => {
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/task 1 —/i), {
      target: { value: 'Read the handbook' },
    })
    fireEvent.change(screen.getByLabelText(/task 1 xp/i), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText(/xp required to finish/i), {
      target: { value: '50' },
    })
    fireEvent.click(screen.getByRole('button', { name: /use all 200/i }))
    expect(screen.getByLabelText(/xp required to finish/i)).toHaveValue(200)
  })

  it('saves the XP finish line with the quest', async () => {
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Family orientation' },
    })
    fireEvent.change(screen.getByLabelText(/xp required to finish/i), {
      target: { value: '300' },
    })
    await publish()
    expect(putBody().xp_threshold).toBe(300)
  })

  it('saves no finish line when the field is left blank', async () => {
    await openBuilder()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Optional course' },
    })
    await publish()
    expect(putBody().xp_threshold).toBeNull()
  })

  it('does not let people write their own tasks unless asked', async () => {
    // Training is a set list of things the school needs done.
    await openBuilder()
    const box = screen.getByRole('checkbox', { name: /let them add tasks of their own/i })
    expect(box).not.toBeChecked()
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), { target: { value: 'T' } })
    await publish()
    expect(putBody().allow_custom_tasks).toBe(false)
  })

  it('lets learners write their own when turned on', async () => {
    await openBuilder()
    fireEvent.click(screen.getByRole('checkbox', { name: /let them add tasks of their own/i }))
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), { target: { value: 'T' } })
    await publish()
    expect(putBody().allow_custom_tasks).toBe(true)
  })

  it('can be unticked for training people opt into', async () => {
    await openBuilder()
    fireEvent.click(screen.getByRole('checkbox', { name: /put it on their accounts/i }))
    fireEvent.change(screen.getByPlaceholderText(/quest title/i), {
      target: { value: 'Optional course' },
    })
    await publish()
    expect(patchBody().auto_assign).toBe(false)
  })

  it('closing a draft nobody wrote in leaves nothing behind in the catalog', async () => {
    await openBuilder()
    // The footer's Close, after the dialog's own and the document panel's.
    fireEvent.click(screen.getAllByRole('button', { name: /^close$/i }).at(-1))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
      '/api/sis/quest-editor/q-new?organization_id=org-1&if_empty=1'))
  })
})
