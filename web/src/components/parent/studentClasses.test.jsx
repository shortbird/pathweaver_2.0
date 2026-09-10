import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StudentClasses from './StudentClasses'

/**
 * A guardian's view of their child's classes used to be spread across pages
 * that did not link to each other: the schedule page had the times and the
 * teacher, the Schedule Builder had add and drop, and the handouts were a flat
 * list further down with class names as headings. "What is my kid doing in
 * Ceramics, and where is the glaze chart" meant three places and a guess
 * (iCreate, 2026-09-10).
 */

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const withClient = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const CONTEXT = {
  data: {
    orgs: [{
      organization_id: 'org-1',
      organization_name: 'iCreate',
      students: [{ student_id: 'kid-1', first_name: 'Ada' }],
    }],
  },
}

const SCHEDULE = {
  data: {
    classes: [
      { id: 'c1', name: 'Ceramics', location: 'Room 4',
        primary_instructor: { name: 'Ada L' },
        meetings: [{ day_of_week: 2, start_time: '09:00', end_time: '10:30' }] },
      { id: 'c2', name: 'Robotics', meetings: [] },
    ],
  },
}

const MATERIALS = {
  data: {
    classes: [{
      class_id: 'c1',
      class_name: 'Ceramics',
      materials: [{ id: 'm1', kind: 'file', title: 'Glaze chart', url: 'https://a/glaze.pdf' }],
    }],
  },
}

const answers = ({ materials = MATERIALS, context = CONTEXT } = {}) => {
  api.get.mockImplementation((url) => {
    if (url.includes('/parent/context')) return Promise.resolve(context)
    if (url.includes('/schedule')) return Promise.resolve(SCHEDULE)
    if (url.includes('/materials')) {
      return materials ? Promise.resolve(materials) : Promise.reject(new Error('404'))
    }
    return Promise.resolve({ data: {} })
  })
}

describe('StudentClasses', () => {
  beforeEach(() => { vi.clearAllMocks(); answers() })

  it('lists the child\'s classes', async () => {
    withClient(<StudentClasses studentId="kid-1" />)
    expect(await screen.findByText('Ceramics')).toBeInTheDocument()
    expect(screen.getByText('Robotics')).toBeInTheDocument()
  })

  it('shows when and where and with whom', async () => {
    withClient(<StudentClasses studentId="kid-1" />)
    expect(await screen.findByText(/Tuesday 9am–10:30am · with Ada L · Room 4/))
      .toBeInTheDocument()
  })

  it('says how many handouts a class has without opening it', async () => {
    withClient(<StudentClasses studentId="kid-1" />)
    expect(await screen.findByText('1 handout')).toBeInTheDocument()
  })

  it('keeps the handouts inside the class, not in a list of their own', async () => {
    withClient(<StudentClasses studentId="kid-1" />)
    await screen.findByText('Ceramics')
    // Collapsed by default: a family with four classes wants to scan the week.
    expect(screen.queryByText('Glaze chart')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ceramics/ }))
    expect(await screen.findByText('Glaze chart')).toBeInTheDocument()
  })

  it('opens a handout in a new tab without handing over the opener', async () => {
    withClient(<StudentClasses studentId="kid-1" />)
    fireEvent.click(await screen.findByRole('button', { name: /Ceramics/ }))
    const anchor = (await screen.findByText('Glaze chart')).closest('a')
    expect(anchor).toHaveAttribute('href', 'https://a/glaze.pdf')
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor.getAttribute('rel')).toContain('noopener')
  })

  it('says so plainly when a class has shared nothing', async () => {
    withClient(<StudentClasses studentId="kid-1" />)
    fireEvent.click(await screen.findByRole('button', { name: /Robotics/ }))
    expect(await screen.findByText('Nothing shared for this class yet.'))
      .toBeInTheDocument()
  })

  it('still lists the classes when handouts are unavailable', async () => {
    /* A school with the classes module off 404s the materials endpoint. The
       class list is worth showing on its own. */
    answers({ materials: null })
    withClient(<StudentClasses studentId="kid-1" />)
    expect(await screen.findByText('Ceramics')).toBeInTheDocument()
  })

  it('renders nothing for a student outside a SIS school', async () => {
    answers({ context: { data: { orgs: [] } } })
    const { container } = withClient(<StudentClasses studentId="kid-1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    await waitFor(() => expect(container.textContent).toBe(''))
  })

  it('renders nothing when the child is in no classes', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/parent/context')) return Promise.resolve(CONTEXT)
      if (url.includes('/schedule')) return Promise.resolve({ data: { classes: [] } })
      return Promise.resolve({ data: { classes: [] } })
    })
    const { container } = withClient(<StudentClasses studentId="kid-1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    await waitFor(() => expect(container.textContent).toBe(''))
  })

  it('names whose classes these are when asked to', async () => {
    withClient(<StudentClasses studentId="kid-1" title="Ada's classes" />)
    expect(await screen.findByText("Ada's classes")).toBeInTheDocument()
  })
})
