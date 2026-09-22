import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StaffComposeModal from './StaffComposeModal'

/**
 * Writing to several staff at once.
 *
 * The console had one way to reach teachers: pick one person, and do it again.
 * The only multi-select in it was the announcement composer, which is a
 * broadcast — no thread, no replies (iCreate, 2026-09-10).
 *
 * What these pin is the part that goes quietly wrong: which shape the send
 * takes, and who ends up in the room.
 */

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const PEOPLE = [
  { id: 'ada', name: 'Ada L', first_name: 'Ada', roles: ['advisor'], role_labels: ['Teacher'] },
  { id: 'sam', name: 'Sam P', first_name: 'Sam', roles: ['advisor'], role_labels: ['Teacher'] },
  { id: 'rae', name: 'Rae Q', first_name: 'Rae', roles: ['advisor'], role_labels: ['Teacher'] },
  { id: 'kate', name: 'Kate A', first_name: 'Kate', roles: ['org_admin'], role_labels: ['Admin'] },
]
const PRESETS = [
  { key: 'all_teachers', label: 'All teachers', member_ids: ['ada', 'sam', 'rae'] },
  { key: 'weekday:2', label: 'Teaching Tuesday', member_ids: ['ada'],
    description: 'Anyone with a class that meets on Tuesday' },
]

const open = (props = {}) => render(
  <StaffComposeModal isOpen orgId="org-1" onClose={vi.fn()} onSent={vi.fn()} {...props} />,
)

const pick = async (name) => {
  fireEvent.click(await screen.findByLabelText(`Select ${name}`))
}

describe('StaffComposeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { people: PEOPLE, presets: PRESETS } })
    api.post.mockResolvedValue({ data: { mode: 'group', sent: 2, skipped: [] } })
  })

  it('sends two people as one group thread by default', async () => {
    open()
    await pick('Ada L')
    await pick('Sam P')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Gate code is 4821' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [, payload] = api.post.mock.calls[0]
    expect(payload.mode).toBe('group')
    expect(payload.recipient_ids.sort()).toEqual(['ada', 'sam'])
    expect(payload.body).toBe('Gate code is 4821')
  })

  it('sends separately when the toggle is on', async () => {
    open()
    await pick('Ada L')
    await pick('Sam P')
    fireEvent.click(screen.getByLabelText(/Send separately/))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Your paperwork' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].mode).toBe('separate')
  })

  it('offers no group toggle for a single recipient', async () => {
    open()
    await pick('Ada L')
    expect(screen.queryByLabelText(/Send separately/)).not.toBeInTheDocument()
  })

  it('a preset fills the chip list', async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: /All teachers/ }))
    expect(await screen.findByLabelText('Remove Ada L')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove Sam P')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove Rae Q')).toBeInTheDocument()
  })

  it('one person can be dropped from a preset before sending', async () => {
    /* "All teachers except Sam" is the common case, and a preset that resolved
       only at send time could not express it. */
    open()
    fireEvent.click(await screen.findByRole('button', { name: /All teachers/ }))
    fireEvent.click(await screen.findByLabelText('Remove Sam P'))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].recipient_ids.sort()).toEqual(['ada', 'rae'])
  })

  it('two presets are unioned, not duplicated', async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: /All teachers/ }))
    fireEvent.click(screen.getByRole('button', { name: /Teaching Tuesday/ }))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].recipient_ids.sort()).toEqual(['ada', 'rae', 'sam'])
  })

  it('will not send with nobody chosen', async () => {
    open()
    await screen.findByLabelText('Select Ada L')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('will not send an empty message', async () => {
    open()
    await pick('Ada L')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('names the thread when one is given', async () => {
    open()
    await pick('Ada L')
    await pick('Sam P')
    fireEvent.change(screen.getByLabelText(/Name this thread/), { target: { value: 'Tuesday cover' } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].name).toBe('Tuesday cover')
  })

  it('searching narrows the list without dropping who is already chosen', async () => {
    open()
    await pick('Ada L')
    fireEvent.change(screen.getByLabelText('Search staff'), { target: { value: 'sam' } })
    expect(screen.queryByLabelText('Select Ada L')).not.toBeInTheDocument()
    // Still in the chip list, so the send is not silently narrowed by a search.
    expect(screen.getByLabelText('Remove Ada L')).toBeInTheDocument()
  })

  // iCreate, 2026-09-22: "the list is too long". Their 158 classes were one
  // quick-pick chip each, which buried the four that name a group of the
  // school under a wall of class names.
  describe('quick picks at a school with many classes', () => {
    const manyClasses = Array.from({ length: 40 }, (_, i) => ({
      key: `class:c${i}`, label: `Class ${String(i).padStart(3, '0')}`, member_ids: ['ada'],
    }))

    beforeEach(() => {
      api.get.mockResolvedValue({ data: { people: PEOPLE, presets: [...PRESETS, ...manyClasses] } })
    })

    it('keeps the school-wide picks as chips and puts the classes in a search box', async () => {
      open()
      expect(await screen.findByRole('button', { name: /All teachers/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Teaching Tuesday/ })).toBeInTheDocument()
      // No chip per class.
      expect(screen.queryByRole('button', { name: /Class 000/ })).toBeNull()
      expect(screen.getByPlaceholderText(/Teachers of a class/)).toBeInTheDocument()
    })

    it('adds a class\'s teachers when you pick it out of that box', async () => {
      open()
      const box = await screen.findByPlaceholderText(/Teachers of a class/)
      fireEvent.focus(box)
      fireEvent.change(box, { target: { value: 'Class 007' } })
      fireEvent.mouseDown(await screen.findByRole('button', { name: /Class 007/ }))

      expect(await screen.findByLabelText('Remove Ada L')).toBeInTheDocument()
    })
  })

  it('clears the search box when you tick somebody, so the next name can be typed', async () => {
    // "you type a staff member's name in the search bar, select the staff
    // member but then you have to erase the name to search again" (an iCreate
    // org admin, 2026-09-22, messaging six teachers one at a time).
    open()
    await screen.findByLabelText('Select Ada L')
    const box = screen.getByLabelText('Search staff')
    fireEvent.change(box, { target: { value: 'ada' } })
    await pick('Ada L')

    expect(box).toHaveValue('')
    // And the whole list is back, so the next person is one keystroke away.
    expect(await screen.findByLabelText('Select Sam P')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove Ada L')).toBeInTheDocument()
  })

  it('leaves the search alone when you untick somebody', async () => {
    // Unticking is correcting the list you are looking at; wiping the filter
    // would throw away the search that got you there.
    open()
    await pick('Ada L')
    const box = screen.getByLabelText('Search staff')
    fireEvent.change(box, { target: { value: 'ada' } })
    fireEvent.click(await screen.findByLabelText('Select Ada L'))

    expect(box).toHaveValue('ada')
  })

  it('reports anyone who could not be reached', async () => {
    const { toast } = await import('react-hot-toast')
    api.post.mockResolvedValue({ data: { mode: 'separate', sent: 1, skipped: ['sam'] } })
    open()
    await pick('Ada L')
    await pick('Sam P')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('1 could not be reached'))
  })

  it('keeps the modal open when the send fails', async () => {
    const onClose = vi.fn()
    api.post.mockRejectedValue({ response: { data: { error: 'Nope' } } })
    open({ onClose })
    await pick('Ada L')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })
})

/**
 * Families (2026-09-18; Molly, b4a4d250 and b32b2fca: "I'm needing to message
 * all the elementary school parents, but I have no way to do that").
 *
 * The audience is students -- every class or one, an age range -- and the
 * recipients are their parents, picked a whole list at a time, one droppable.
 * The send goes to its own route, never with a mode: a private thread each is
 * the only shape.
 *
 * Since 2026-09-22 (Molly, 77efe09b: "it would be nice if i could add extra
 * people who are NOT in the class. Like I just sent a message to the CLD
 * parents. But I couldn't add the teacher on to that message too") a filter
 * shows families and never changes who is picked, so an audience can be built
 * across filters, and staff can be copied.
 */
const FAMILIES = {
  people: [
    { id: 'lark-mum', name: 'Mia Lark', students: ['Ada Lark', 'Ben Lark'] },
    { id: 'moss-mum', name: 'Una Moss', students: ['Cy Moss'] },
  ],
  students: 3, without_birthdate: 1,
  classes: [{ id: 'class-art', name: 'Art' }, { id: 'class-robotics', name: 'Robotics' }],
}

const audienceCalls = () => api.get.mock.calls.map(([url]) => url).filter((u) => u.includes('family-audience'))

describe('StaffComposeModal, to families', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockImplementation((url) => Promise.resolve({
      data: url.includes('family-audience') ? FAMILIES : { people: PEOPLE, presets: PRESETS },
    }))
    api.post.mockResolvedValue({ data: { mode: 'families', sent: 2, skipped: [], emailed: 0 } })
  })

  const toFamilies = async () => {
    open()
    fireEvent.click(await screen.findByRole('button', { name: 'Families' }))
    await screen.findByText('Mia Lark')
  }

  const selectAllShown = () => fireEvent.click(screen.getByRole('button', { name: /^Select all/ }))

  it('loads the parents of every current student, none ticked, and says who it left out', async () => {
    // Changed 2026-09-22 (77efe09b): this list used to arrive all ticked. With
    // picks that persist across filters, a list that ticked itself would keep
    // the whole school in the send after someone narrowed to one class.
    await toFamilies()
    expect(audienceCalls()).toEqual(['/api/sis/messaging/family-audience?organization_id=org-1'])
    expect(screen.getByLabelText('Select Mia Lark')).not.toBeChecked()
    expect(screen.getByLabelText('Select Una Moss')).not.toBeChecked()
    // Why each parent is here: the children the filter matched.
    expect(screen.getByText('Ada Lark, Ben Lark')).toBeInTheDocument()
    expect(screen.getByText(/0 of 2 parents of 3 students/)).toBeInTheDocument()
    expect(screen.getByText('0 parents selected')).toBeInTheDocument()
    selectAllShown()
    expect(screen.getByLabelText('Select Mia Lark')).toBeChecked()
    expect(screen.getByLabelText('Select Una Moss')).toBeChecked()
    expect(screen.getByText(/2 of 2 parents of 3 students/)).toBeInTheDocument()
    expect(screen.getByText(/1 student has no birth date on file/)).toBeInTheDocument()
  })

  it('sends to its own route with the ticked parents and no mode', async () => {
    await toFamilies()
    selectAllShown()
    fireEvent.change(screen.getByLabelText('Subject (optional)'), { target: { value: 'Field day' } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Bring boots.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, payload] = api.post.mock.calls[0]
    expect(url).toBe('/api/sis/messaging/compose-families?organization_id=org-1')
    expect(payload).toEqual({ recipient_ids: ['lark-mum', 'moss-mum'], subject: 'Field day', body: 'Bring boots.', email: false })
    expect(payload).not.toHaveProperty('mode')
  })

  it('one family can be dropped before sending', async () => {
    await toFamilies()
    selectAllShown()
    fireEvent.click(screen.getByLabelText('Select Una Moss'))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].recipient_ids).toEqual(['lark-mum'])
  })

  it('says the message reaches parents, not the students it is filtered by', async () => {
    // "When I selected send to 'Students in' and then it lists the classes,
    // I'm not really sure if it's just to parents or parents and students?"
    // (an iCreate org admin, 2026-09-22). It has only ever gone to guardians.
    await toFamilies()
    expect(screen.getByText('Parents of students in')).toBeInTheDocument()
    expect(screen.queryByText('Students in')).not.toBeInTheDocument()
  })

  it('narrows by class and by age through the audience route', async () => {
    await toFamilies()
    const picker = screen.getByPlaceholderText('Every class')
    fireEvent.focus(picker)
    fireEvent.change(picker, { target: { value: 'Rob' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'Robotics' }))
    await waitFor(() => expect(audienceCalls().at(-1)).toContain('class_id=class-robotics'))

    fireEvent.change(screen.getByLabelText('Youngest age'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Oldest age'), { target: { value: '1x0' } })
    await waitFor(() => expect(audienceCalls().at(-1)).toContain('age_min=5'))
    // Letters never reach the request.
    expect(audienceCalls().at(-1)).toContain('age_max=10')
  })

  it('emails a copy only when asked, and says so', async () => {
    api.post.mockResolvedValue({ data: { mode: 'families', sent: 2, skipped: [], emailed: 2 } })
    await toFamilies()
    selectAllShown()
    fireEvent.click(screen.getByLabelText(/Also send by email/))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].email).toBe(true)
    const { toast } = await import('react-hot-toast')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
      'Sent to 2 parents, each in their own thread, and emailed 2'))
  })

  it('will not send with every family unticked', async () => {
    await toFamilies()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    selectAllShown()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(api.post).not.toHaveBeenCalled()
  })

  describe('picks persist across filters (77efe09b)', () => {
    const ART = { ...FAMILIES, people: [{ id: 'lark-mum', name: 'Mia Lark', students: ['Ada Lark'] }], students: 1 }
    const ROBOTICS = { ...FAMILIES, people: [{ id: 'moss-mum', name: 'Una Moss', students: ['Cy Moss'] }], students: 1 }

    beforeEach(() => {
      api.get.mockImplementation((url) => Promise.resolve({
        data: !url.includes('family-audience') ? { people: PEOPLE, presets: PRESETS }
          : url.includes('class-art') ? ART
            : url.includes('class-robotics') ? ROBOTICS : FAMILIES,
      }))
    })

    const pickClass = async (label) => {
      const box = screen.getByPlaceholderText('Every class')
      fireEvent.focus(box)
      fireEvent.change(box, { target: { value: label } })
      fireEvent.mouseDown(await screen.findByRole('button', { name: label }))
    }

    it('a second filter adds to the first instead of replacing it', async () => {
      await toFamilies()
      await pickClass('Art')
      await waitFor(() => expect(screen.queryByText('Una Moss')).not.toBeInTheDocument())
      selectAllShown()
      await pickClass('Robotics')
      await waitFor(() => expect(screen.queryByLabelText('Select Mia Lark')).not.toBeInTheDocument())
      // Mia is off screen but still picked, named, and removable.
      expect(screen.getByText('1 parent selected')).toBeInTheDocument()
      expect(screen.getByLabelText('Remove Mia Lark')).toBeInTheDocument()
      selectAllShown()
      expect(screen.getByText('2 parents selected')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
      await waitFor(() => expect(api.post).toHaveBeenCalled())
      expect(api.post.mock.calls[0][1].recipient_ids.sort()).toEqual(['lark-mum', 'moss-mum'])
    })

    it('Clear all empties the picks from every filter', async () => {
      await toFamilies()
      await pickClass('Art')
      await waitFor(() => expect(screen.queryByText('Una Moss')).not.toBeInTheDocument())
      selectAllShown()
      await pickClass('Robotics')
      await waitFor(() => expect(screen.getByLabelText('Remove Mia Lark')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
      expect(screen.getByText('0 parents selected')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    })

    it('copies a teacher, labelled with the filters the families came from', async () => {
      api.post.mockResolvedValue({ data: { mode: 'families', sent: 1, skipped: [], emailed: 0, staff_sent: 1 } })
      await toFamilies()
      await pickClass('Art')
      await waitFor(() => expect(screen.queryByText('Una Moss')).not.toBeInTheDocument())
      selectAllShown()

      const staffBox = screen.getByPlaceholderText('Add a teacher or staff member')
      fireEvent.focus(staffBox)
      fireEvent.change(staffBox, { target: { value: 'Sam' } })
      fireEvent.mouseDown(await screen.findByRole('button', { name: 'Sam P' }))
      expect(screen.getByLabelText('Stop copying Sam P')).toBeInTheDocument()
      expect(screen.getByText(/copy to 1 staff/)).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
      await waitFor(() => expect(api.post).toHaveBeenCalled())
      const [url, payload] = api.post.mock.calls[0]
      expect(url).toBe('/api/sis/messaging/compose-families?organization_id=org-1')
      // Staff never go in recipient_ids: that list is families only.
      expect(payload.recipient_ids).toEqual(['lark-mum'])
      expect(payload.staff_ids).toEqual(['sam'])
      expect(payload.audience_label).toBe('Art')
      const { toast } = await import('react-hot-toast')
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(
        'Sent to 1 parent, each in their own thread, with a copy to 1 staff'))
    })

    it('a copied teacher can be taken off again', async () => {
      await toFamilies()
      selectAllShown()
      const staffBox = screen.getByPlaceholderText('Add a teacher or staff member')
      fireEvent.focus(staffBox)
      fireEvent.change(staffBox, { target: { value: 'Sam' } })
      fireEvent.mouseDown(await screen.findByRole('button', { name: 'Sam P' }))
      fireEvent.click(screen.getByLabelText('Stop copying Sam P'))
      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
      fireEvent.click(screen.getByRole('button', { name: 'Send' }))
      await waitFor(() => expect(api.post).toHaveBeenCalled())
      expect(api.post.mock.calls[0][1]).not.toHaveProperty('staff_ids')
    })
  })

  it('the staff side is untouched by switching back', async () => {
    await toFamilies()
    fireEvent.click(screen.getByRole('button', { name: 'Staff' }))
    await pick('Ada L')
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toBe('/api/sis/messaging/compose?organization_id=org-1')
  })
})
