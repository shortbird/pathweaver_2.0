import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The student's own door to class materials (iCreate 3e37d8b8 / f1787a98).
 *
 * Students could only reach materials through ClassCurriculum on a QUEST page.
 * Musical Theater had two files, twenty-six students and no quest, so its
 * teacher's "the dance videos are under class materials" pointed at a page that
 * did not exist for any of them.
 */

import MyClassMaterials from './MyClassMaterials'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const renderCard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MyClassMaterials /></QueryClientProvider>)
}

const CLASSES = [{
  class_id: 'c1',
  class_name: 'Musical Theater',
  materials: [
    { id: 'm1', kind: 'link', title: 'Dance Videos', url: 'https://example.com/dance' },
    { id: 'm2', kind: 'file', title: 'Music Tracks', url: 'https://example.com/tracks' },
  ],
}]

beforeEach(() => vi.clearAllMocks())

describe('the student class-materials card', () => {
  it('lists what the class shared, under the class name', async () => {
    api.get.mockResolvedValue({ data: { success: true, classes: CLASSES } })
    renderCard()

    expect(await screen.findByText('Musical Theater')).toBeInTheDocument()
    const dance = await screen.findByRole('link', { name: /Dance Videos/ })
    expect(dance).toHaveAttribute('href', 'https://example.com/dance')
    expect(screen.getByRole('link', { name: /Music Tracks/ })).toBeInTheDocument()
  })

  it('asks the self-scoped endpoint, with no id in it', async () => {
    api.get.mockResolvedValue({ data: { success: true, classes: CLASSES } })
    renderCard()
    await screen.findByText('Musical Theater')
    expect(api.get).toHaveBeenCalledWith('/api/sis/student/materials')
  })

  it('renders nothing when there is nothing shared', async () => {
    api.get.mockResolvedValue({ data: { success: true, classes: [] } })
    const { container } = renderCard()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the school has the classes module off', async () => {
    // The endpoint 404s there. A card reading "no materials" would otherwise
    // appear on every family and teacher school page in every school.
    api.get.mockRejectedValue({ response: { status: 404 } })
    const { container } = renderCard()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
