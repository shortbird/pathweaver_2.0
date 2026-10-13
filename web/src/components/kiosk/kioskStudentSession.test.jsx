/**
 * Student mode on the kiosk: the two things a young student at a shared iPad
 * cannot do any other way.
 *
 * Assigning a quest to a class creates no enrollment, and these students
 * never log in, so the kiosk lists class assignments and starts one on a tap.
 * And the quest may list nothing matching what the child actually did, so
 * "I did something else" adds a task from one answer and goes to the camera.
 *
 * The capture screen takes photos from the camera roll as well as the camera
 * (Arete, 2026-09-15: "upload things we got pics of throughout the day").
 *
 * "Add to my journal" saves work that belongs to no quest, under a topic the
 * child picks, adds or renames on the tablet (Apogee Cache Valley,
 * 2026-10-13: no classes, and many young children with no quest at all).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

import KioskStudentSession from './KioskStudentSession'

// The Give points panel (ticket 0f401a62) reads through react-query.
const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const dashboard = ({ active = [], assigned = [] } = {}) => ({
  data: { active_quests: active, assigned_class_quests: assigned },
})

const enrollment = (questId, title, tasks) => ({
  id: `uq-${questId}`,
  quest_id: questId,
  quests: { id: questId, title, quest_tasks: tasks },
})

const assignment = (questId, title, className) => ({
  class_id: 'c1', class_name: className, due_date: null,
  quest: { id: questId, title, is_active: true },
})

beforeEach(() => { vi.clearAllMocks() })

describe('KioskStudentSession', () => {
  it('lists class assignments and a tap starts the quest, then shows the copied tasks', async () => {
    const teacherTasks = [{ id: 't1', title: 'Draw your habitat', xp_value: 50, is_completed: false }]
    api.get
      .mockResolvedValueOnce(dashboard({ assigned: [assignment('q1', 'Marine Biology', 'Explorers')] }))
      .mockResolvedValueOnce(dashboard({ active: [enrollment('q1', 'Marine Biology', teacherTasks)] }))
    api.post.mockResolvedValue({ data: { success: true } })

    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    expect(await screen.findByText('Assigned to you')).toBeInTheDocument()
    expect(screen.getByText(/From Explorers/)).toBeInTheDocument()
    expect(screen.queryByText(/don't have any quests/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Marine Biology'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/quests/q1/enroll', {}))
    expect(await screen.findByText('Which task did you work on?')).toBeInTheDocument()
    expect(screen.getByText('Draw your habitat')).toBeInTheDocument()
  })

  it('an assignment already started is not listed twice', async () => {
    api.get.mockResolvedValueOnce(dashboard({
      active: [enrollment('q1', 'Marine Biology', [])],
      assigned: [assignment('q1', 'Marine Biology', 'Explorers')],
    }))
    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    expect(await screen.findByText('Marine Biology')).toBeInTheDocument()
    expect(screen.queryByText('Assigned to you')).not.toBeInTheDocument()
  })

  it('a failed start stays on the quest screen with a retryable message', async () => {
    api.get.mockResolvedValueOnce(dashboard({ assigned: [assignment('q1', 'Marine Biology', 'Explorers')] }))
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Quest not found' } } })
    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    fireEvent.click(await screen.findByText('Marine Biology'))
    expect(await screen.findByText('Quest not found')).toBeInTheDocument()
    expect(screen.getByText('Assigned to you')).toBeInTheDocument()
  })

  it('"I did something else" adds a task from one answer and goes to the camera', async () => {
    api.get.mockResolvedValueOnce(dashboard({ active: [enrollment('q1', 'Outdoor Survival', [])] }))
    api.post.mockResolvedValueOnce({ data: { success: true, tasks: [{ id: 'new1', title: 'I built a shelter', xp_value: 50 }] } })

    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    // A quest with no tasks is still offered: the child can add one.
    fireEvent.click(await screen.findByText('Outdoor Survival'))
    fireEvent.click(await screen.findByText('I did something else'))
    const input = await screen.findByLabelText('What did you do?')
    expect(screen.getByText('Next: take a photo')).toBeDisabled()
    fireEvent.change(input, { target: { value: '  I built a shelter ' } })
    fireEvent.click(screen.getByText('Next: take a photo'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/quests/q1/add-manual-tasks',
      { tasks: [{ title: 'I built a shelter' }] }))
    expect(await screen.findByText('Take a photo of your work')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'I built a shelter' })).toBeInTheDocument()

    // Back from the camera: the new task is now on the list.
    fireEvent.click(screen.getByLabelText('Back'))
    expect(await screen.findByText('Which task did you work on?')).toBeInTheDocument()
    expect(screen.getByText('I built a shelter')).toBeInTheDocument()
  })

  it('a refused task (custom tasks turned off for the quest) is explained, not swallowed', async () => {
    api.get.mockResolvedValueOnce(dashboard({ active: [enrollment('q1', 'Outdoor Survival', [])] }))
    api.post.mockRejectedValueOnce({ response: { data: { error: 'This quest does not allow custom tasks' } } })
    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    fireEvent.click(await screen.findByText('Outdoor Survival'))
    fireEvent.click(await screen.findByText('I did something else'))
    fireEvent.change(await screen.findByLabelText('What did you do?'), { target: { value: 'Made a map' } })
    fireEvent.click(screen.getByText('Next: take a photo'))
    expect(await screen.findByText('This quest does not allow custom tasks')).toBeInTheDocument()
    expect(screen.getByLabelText('What did you do?')).toHaveValue('Made a map')
  })

  describe('the capture screen', () => {
    const openCapture = async () => {
      const tasks = [{ id: 't1', title: 'Draw your habitat', xp_value: 50, is_completed: false }]
      api.get.mockResolvedValueOnce(dashboard({ active: [enrollment('q1', 'Marine Biology', tasks)] }))
      render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
      fireEvent.click(await screen.findByText('Marine Biology'))
      fireEvent.click(await screen.findByText('Draw your habitat'))
      await screen.findByText('Take a photo of your work')
    }

    beforeEach(() => {
      // jsdom has no object URLs; the thumbnails only need a string.
      globalThis.URL.createObjectURL = vi.fn((file) => `blob:${file.name}`)
      globalThis.URL.revokeObjectURL = vi.fn()
    })

    it('offers the photo library beside the camera, and only the camera input opens the camera', async () => {
      await openCapture()
      const camera = screen.getByLabelText('Take a photo')
      const library = screen.getByLabelText('Choose from photos')
      expect(camera).toHaveAttribute('capture', 'environment')
      expect(library).not.toHaveAttribute('capture')
      expect(library).toHaveAttribute('accept', 'image/*')
      expect(library).toHaveAttribute('multiple')
      expect(screen.getByRole('button', { name: /Take photo/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Choose from photos/ })).toBeInTheDocument()
    })

    it('a picture picked from the library counts the same as one just taken', async () => {
      await openCapture()
      expect(screen.getByRole('button', { name: /Turn in/ })).toBeDisabled()

      const picked = new File(['jpg'], 'field-trip.jpg', { type: 'image/jpeg' })
      fireEvent.change(screen.getByLabelText('Choose from photos'), { target: { files: [picked] } })

      expect(await screen.findByAltText('Photo 1')).toHaveAttribute('src', 'blob:field-trip.jpg')
      expect(screen.getByRole('button', { name: 'Turn in 1 photo' })).toBeEnabled()
      // Not swallowed by the library input: the camera button now reads as an add.
      expect(screen.getByRole('button', { name: /Add another/ })).toBeInTheDocument()
    })

    it('the library input ignores a file that is not an image', async () => {
      await openCapture()
      const doc = new File(['pdf'], 'notes.pdf', { type: 'application/pdf' })
      fireEvent.change(screen.getByLabelText('Choose from photos'), { target: { files: [doc] } })
      expect(screen.queryByAltText('Photo 1')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Turn in/ })).toBeDisabled()
    })
  })

  it('with the journal off and nothing started or assigned, points at the teacher', async () => {
    api.get.mockResolvedValueOnce(dashboard())
    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} journalEnabled={false} />)
    expect(await screen.findByText("You don't have any quests yet.")).toBeInTheDocument()
    expect(screen.getByText(/assign one to your class/)).toBeInTheDocument()
    expect(screen.queryByText('Add to my journal')).not.toBeInTheDocument()
  })

  describe('add to my journal', () => {
    const TOPICS = [{ id: 'tr-read', name: 'Reading', color: '#123456' }]

    beforeEach(() => {
      globalThis.URL.createObjectURL = vi.fn((file) => `blob:${file.name}`)
      globalThis.URL.revokeObjectURL = vi.fn()
    })

    const openJournal = async () => {
      api.get
        .mockResolvedValueOnce(dashboard())
        .mockResolvedValueOnce({ data: { success: true, tracks: TOPICS } })
      render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
      // A child with no quest is no longer at a dead end.
      expect(screen.queryByText(/assign one to your class/)).not.toBeInTheDocument()
      fireEvent.click(await screen.findByText('Add to my journal'))
      await screen.findByText('Which topic is this for?')
      await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/interest-tracks'))
    }

    const addPhoto = () => {
      const picked = new File(['jpg'], 'page.jpg', { type: 'image/jpeg' })
      fireEvent.change(screen.getByLabelText('Choose from photos'), { target: { files: [picked] } })
    }

    it('saves the photos as a journal moment under the chosen topic', async () => {
      await openJournal()
      api.post.mockImplementation(async (url) => {
        if (url === '/api/learning-events/quick') return { data: { success: true, event: { id: 'ev1' } } }
        if (url === '/api/learning-events/ev1/upload') return { data: { file_url: 'https://x/page.jpg', filename: 'page.jpg' } }
        return { data: { success: true } }
      })
      fireEvent.click(await screen.findByText('Reading'))
      expect(await screen.findByText('Take a photo of your work')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /to my journal/ })).toBeDisabled()
      addPhoto()
      fireEvent.change(screen.getByLabelText('What did you do?'), { target: { value: 'I read a level 3 book' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save 1 photo to my journal' }))

      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/learning-events/quick', {
        description: 'I read a level 3 book',
        topics: [{ type: 'topic', id: 'tr-read' }],
      }))
      expect(await screen.findByText('Saved to your journal in Reading.')).toBeInTheDocument()
      const evidence = api.post.mock.calls.find(([url]) => url === '/api/learning-events/ev1/evidence')
      expect(evidence[1].blocks).toEqual([expect.objectContaining({
        block_type: 'image', file_url: 'https://x/page.jpg',
      })])
    })

    it('a new topic can be added on the tablet and appears in the list', async () => {
      await openJournal()
      api.post.mockResolvedValueOnce({ data: { success: true, track: { id: 'tr-math', name: 'Math' } } })
      fireEvent.click(screen.getByText('New topic'))
      fireEvent.change(screen.getByLabelText('New topic name'), { target: { value: ' Math ' } })
      fireEvent.click(screen.getByText('Add'))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/interest-tracks', { name: 'Math' }))
      expect(await screen.findByText('Math')).toBeInTheDocument()
    })

    it('a topic can be renamed in place', async () => {
      await openJournal()
      api.put.mockResolvedValueOnce({ data: { success: true, track: { id: 'tr-read', name: 'Waseca Reading' } } })
      fireEvent.click(await screen.findByLabelText('Rename Reading'))
      fireEvent.change(screen.getByLabelText('Topic name'), { target: { value: 'Waseca Reading' } })
      fireEvent.click(screen.getByText('Save'))
      await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/interest-tracks/tr-read', { name: 'Waseca Reading' }))
      expect(await screen.findByText('Waseca Reading')).toBeInTheDocument()
    })

    it('a moment can be saved without a topic, with a readable caption', async () => {
      await openJournal()
      api.post.mockImplementation(async (url) => {
        if (url === '/api/learning-events/quick') return { data: { success: true, event: { id: 'ev2' } } }
        if (url.endsWith('/upload')) return { data: { file_url: 'https://x/p.jpg' } }
        return { data: { success: true } }
      })
      fireEvent.click(screen.getByText('Skip: save without a topic'))
      await screen.findByText('Take a photo of your work')
      addPhoto()
      fireEvent.click(screen.getByRole('button', { name: 'Save 1 photo to my journal' }))
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/learning-events/quick',
        { description: 'Photo of my work' }))
      expect(await screen.findByText('Saved to your journal.')).toBeInTheDocument()
    })
  })
})

/**
 * Ticket 0f401a62 (Apogee Cache Valley): "we do have a studio leader each
 * session that tracks points." A points helper who signs in on the tablet
 * gets "Give points"; nobody else does, and a school without points is
 * never asked.
 */
describe('KioskStudentSession give points', () => {
  const helperBoard = {
    success: true,
    students: [{ student_id: 's2', name: 'Ben Kid', balance: 4 }],
    buttons: [{ id: 'b1', label: 'Daily job', amount: 5 }],
    max_amount: 10,
    recent: [],
  }

  const serve = (isHelper) => api.get.mockImplementation((url) => {
    if (url === '/api/users/dashboard') return Promise.resolve(dashboard())
    if (url === '/api/sis/points/mine') {
      return Promise.resolve({ data: { success: true, students: [{ student_id: 's1', is_helper: isHelper }] } })
    }
    if (url === '/api/sis/points/helper') return Promise.resolve({ data: helperBoard })
    return Promise.resolve({ data: {} })
  })

  it('a helper opens Give points and gives a quick button', async () => {
    serve(true)
    api.post.mockResolvedValue({ data: { success: true } })
    render(<KioskStudentSession studentName="Hal" onFinished={vi.fn()} pointsEnabled />)
    fireEvent.click(await screen.findByText('Give points'))
    fireEvent.click(await screen.findByLabelText('Select Ben Kid'))
    fireEvent.click(screen.getByRole('button', { name: /Daily job \+5/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/sis/points/helper/entries',
      { student_ids: ['s2'], amount: 5, reason: 'Daily job' }))
  })

  it('a student who is not a helper sees no Give points', async () => {
    serve(false)
    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} pointsEnabled />)
    expect(await screen.findByText('Add to my journal')).toBeInTheDocument()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/sis/points/mine'))
    expect(screen.queryByText('Give points')).not.toBeInTheDocument()
  })

  it('a school without points is never asked', async () => {
    serve(true)
    render(<KioskStudentSession studentName="Ada" onFinished={vi.fn()} />)
    expect(await screen.findByText('Add to my journal')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalledWith('/api/sis/points/mine')
    expect(screen.queryByText('Give points')).not.toBeInTheDocument()
  })
})
