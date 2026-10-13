import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PhotosPage, { localToday } from './PhotosPage'
import { SIS_MODULE_BY_PATH, isPathHidden } from './sisModules'
import { NAV_SECTIONS } from '../../components/sis/SisSidebar'

/**
 * Ticket 85949de5 (Apogee Cache Valley): "a Photos page where a coach takes or
 * uploads a picture, taps every student in it, saves; each tagged student's
 * parents get an email; the photo also goes into each tagged student's
 * journal." The page uploads, tags and reports; the server decides the rest.
 */

const render = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
}

let authState = { user: { id: 'coach-1', role: 'org_managed', org_role: 'advisor' } }
let orgState = { organization: { id: 'org-1', name: 'Apogee Cache Valley' } }

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('../../contexts/OrganizationContext', () => ({ useOrganization: () => orgState }))
vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, home } = vi.hoisted(() => {
  const home = () => ({ data: {
    success: true,
    students: [
      { id: 's1', name: 'Ada Kid' },
      { id: 's2', name: 'Ben Kid' },
      { id: 's3', name: 'Cal Lee' },
    ],
    recent: [
      { id: 'e1', caption: 'Bridge build', event_date: '2026-10-12', captured_by_name: 'David',
        students: [{ id: 's1', name: 'Ada Kid' }, { id: 's2', name: 'Ben Kid' }],
        media: [{ type: 'image', url: 'https://signed.example/a.jpg' }] },
    ],
  } })
  return {
    home,
    api: {
      get: vi.fn(() => Promise.resolve(home())),
      post: vi.fn(),
    },
  }
})
vi.mock('../../services/api', () => ({ default: api }))

const PHOTO_POINTER = 'https://x.supabase.co/storage/v1/object/public/quest-evidence/events/coach-1/a.jpg'

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(() => Promise.resolve(home()))
  api.post.mockImplementation((url) => {
    if (url.includes('/api/sis/photos/upload')) {
      return Promise.resolve({ data: { success: true, files: [
        { url: PHOTO_POINTER, original_name: 'a.jpg', size: 12, content_type: 'image/jpeg' }] } })
    }
    return Promise.resolve({ data: { success: true, count: 2, families_notified: 1, parents_notified: 2 } })
  })
})

const addPhoto = (testId = 'upload-input') => {
  const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByTestId(testId), { target: { files: [file] } })
  return file
}

describe('PhotosPage', () => {
  it('lists the school students as chips and the recent captures', async () => {
    render(<PhotosPage />)
    expect(await screen.findByRole('button', { name: 'Ada Kid' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Cal Lee' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/photos?organization_id=org-1')
    expect(screen.getByText('Bridge build')).toBeInTheDocument()
    expect(screen.getByText('Ada Kid, Ben Kid')).toBeInTheDocument()
  })

  it('offers the camera and an upload of several files', async () => {
    render(<PhotosPage />)
    await screen.findByRole('button', { name: 'Ada Kid' })
    expect(screen.getByTestId('camera-input')).toHaveAttribute('capture', 'environment')
    expect(screen.getByTestId('upload-input')).toHaveAttribute('multiple')
  })

  it('search narrows the chips, and tapping one tags it', async () => {
    render(<PhotosPage />)
    await screen.findByRole('button', { name: 'Ada Kid' })
    fireEvent.change(screen.getByLabelText('Search students'), { target: { value: 'cal' } })
    expect(screen.queryByRole('button', { name: 'Ada Kid' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cal Lee' }))
    // Tagging clears the search so the next name is one tap away.
    expect(screen.getByLabelText('Search students')).toHaveValue('')
    expect(screen.getByRole('button', { name: /Cal Lee/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Save to 1 journal' })).toBeEnabled()
  })

  it('uploads first, then saves every tagged student with the caption and date, and says who was told', async () => {
    render(<PhotosPage />)
    await screen.findByRole('button', { name: 'Ada Kid' })
    addPhoto()
    fireEvent.click(screen.getByRole('button', { name: 'Ada Kid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ben Kid' }))
    fireEvent.change(screen.getByPlaceholderText('What were they doing?'), { target: { value: 'Science fair' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save to 2 journals' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    const [uploadUrl, form] = api.post.mock.calls[0]
    expect(uploadUrl).toBe('/api/sis/photos/upload?organization_id=org-1')
    expect(form.getAll('files')).toHaveLength(1)
    const [saveUrl, body] = api.post.mock.calls[1]
    expect(saveUrl).toBe('/api/sis/photos?organization_id=org-1')
    expect(body).toEqual({
      student_ids: ['s1', 's2'], caption: 'Science fair', event_date: localToday(),
      media: [{ type: 'image', file_url: PHOTO_POINTER, file_name: 'a.jpg', file_size: 12 }],
    })

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Saved to 2 journals.')
    expect(status).toHaveTextContent('1 family notified.')
    // The form is ready for the next photo.
    expect(screen.getByRole('button', { name: 'Ada Kid' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('a caption alone is a capture: no upload request', async () => {
    render(<PhotosPage />)
    await screen.findByRole('button', { name: 'Ada Kid' })
    fireEvent.click(screen.getByRole('button', { name: 'Ada Kid' }))
    fireEvent.change(screen.getByPlaceholderText('What were they doing?'), { target: { value: 'Read aloud' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save to 1 journal' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    expect(api.post.mock.calls[0][0]).toBe('/api/sis/photos?organization_id=org-1')
    expect(api.post.mock.calls[0][1].media).toEqual([])
  })

  it('says so when no parent is linked', async () => {
    api.post.mockImplementation(() => Promise.resolve({ data: { count: 1, families_notified: 0 } }))
    render(<PhotosPage />)
    await screen.findByRole('button', { name: 'Ada Kid' })
    fireEvent.click(screen.getByRole('button', { name: 'Ada Kid' }))
    fireEvent.change(screen.getByPlaceholderText('What were they doing?'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save to 1 journal' }))
    expect(await screen.findByRole('status')).toHaveTextContent('nobody was notified')
  })

  it('cannot save before a student is tapped', async () => {
    render(<PhotosPage />)
    await screen.findByRole('button', { name: 'Ada Kid' })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('a photo can be removed before saving', async () => {
    render(<PhotosPage />)
    await screen.findByRole('button', { name: 'Ada Kid' })
    addPhoto('camera-input')
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.jpg' }))
    expect(screen.queryByRole('button', { name: 'Remove a.jpg' })).not.toBeInTheDocument()
  })
})

describe('Photos in the console', () => {
  it('follows the group_photos module, off by default', () => {
    expect(SIS_MODULE_BY_PATH['/photos']).toBe('group_photos')
    expect(isPathHidden('/photos', { id: 'org-1', feature_flags: {} })).toBe(true)
    expect(isPathHidden('/photos', {
      id: 'org-1', feature_flags: { sis_enabled: true, modules: { group_photos: true } },
      effective_modules: ['sis', 'group_photos'],
    })).toBe(false)
  })

  it('is in the sidebar for staff, not only admins', () => {
    const item = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.path === '/photos')
    expect(item).toMatchObject({ name: 'Photos' })
    expect(item.adminOnly).toBeFalsy()
  })
})
