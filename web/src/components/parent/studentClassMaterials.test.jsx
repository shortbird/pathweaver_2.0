/**
 * A parent finding the handouts their student's teacher told them about.
 *
 * The teacher announced them in the parent chat; the parent had nowhere to open
 * them, because every materials surface until now was gated on being IN the
 * class (iCreate, Musical Theater, 2026-09-09).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import StudentClassMaterials from './StudentClassMaterials'

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('../../services/api', () => ({ default: api }))

const render = (ui) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const groups = [{
  class_id: 'c1',
  class_name: 'Musical Theater',
  materials: [
    { id: 'm1', kind: 'link', title: 'Dance Videos', url: 'https://example.com/dance' },
    { id: 'm2', kind: 'link', title: 'Music Tracks', url: 'https://example.com/tracks' },
  ],
}]

describe('StudentClassMaterials', () => {
  beforeEach(() => { api.get.mockReset() })

  it('lists each class handout under its class name', async () => {
    api.get.mockResolvedValue({ data: { success: true, classes: groups } })
    render(<StudentClassMaterials studentId="s1" />)

    expect(await screen.findByText('Musical Theater')).toBeInTheDocument()
    expect(screen.getByText('Dance Videos').closest('a'))
      .toHaveAttribute('href', 'https://example.com/dance')
    expect(screen.getByText('Music Tracks').closest('a'))
      .toHaveAttribute('href', 'https://example.com/tracks')
    expect(api.get).toHaveBeenCalledWith('/api/sis/parent/students/s1/materials')
  })

  it('renders nothing when the family has no materials', async () => {
    api.get.mockResolvedValue({ data: { success: true, classes: [] } })
    const { container } = render(<StudentClassMaterials studentId="s1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('stays silent for a school with the classes module off (the route 404s)', async () => {
    // Not an error state to a family: it is a school that does not use classes.
    // A visible "could not load" would sit on every such dashboard forever.
    api.get.mockRejectedValue({ response: { status: 404 } })
    const { container } = render(<StudentClassMaterials studentId="s1" />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
