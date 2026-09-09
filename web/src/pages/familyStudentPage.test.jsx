import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  default: { success: vi.fn(), error: vi.fn() },
}))

const { api, recordPayload } = vi.hoisted(() => {
  const recordPayload = {
    success: true,
    record: {
      profile: {
        preferred_name: 'Gryff',
        grade: '4th',
        hobbies: 'Legos, soccer',
        notes: 'No social media permission',
        carpool: 'Tuesdays with the Smiths',
      },
      assessments: {
        math_cle: { boy: 'Book 401', eoy: 'Book 405' },
        la_cle: { boy: 'Book 400', eoy: '' },
      },
    },
    assessment_fields: [
      { key: 'math_cle', label: 'Math CLE Book' },
      { key: 'la_cle', label: 'LA CLE Book' },
      { key: 'addition_facts', label: 'Addition Facts' },
    ],
    materials: [
      { id: 'm1', item_name: 'Math CLE 401-405', paid: true, received: false, notes: 'Ordered 8/1' },
    ],
    student: {
      id: 's1', name: 'Gryffin Jones', preferred_name: 'Gryff',
      date_of_birth: '2016-04-02', grade_level: '4th', avatar_url: null,
    },
    scores: [
      {
        class_id: 'c1', class_name: 'Math', average: 92.5,
        assignments: [
          { id: 'a1', name: 'Quiz 1', date_completed: '2026-09-10', score: 9, max_score: 10, notes: null },
          { id: 'a2', name: 'Test 1', date_completed: null, score: 96, max_score: 100, notes: null },
        ],
      },
    ],
  }
  return {
    recordPayload,
    api: {
      get: vi.fn(() => Promise.resolve({ data: recordPayload })),
      post: vi.fn(() => Promise.resolve({ data: {} })),
    },
  }
})
vi.mock('../services/api', () => ({ default: api }))

import FamilyStudentPage from './FamilyStudentPage'

const renderPage = () =>
  rtlRender(
    <MemoryRouter initialEntries={['/family/students/s1']}>
      <Routes>
        <Route path="/family/students/:studentId" element={<FamilyStudentPage />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation(() => Promise.resolve({ data: recordPayload }))
})

describe('FamilyStudentPage', () => {
  it('loads the record from the parent endpoint and shows the student header', async () => {
    renderPage()
    expect(await screen.findByText('Gryffin Jones')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/sis/parent/students/s1/record')
  })

  it('renders profile fields including extra keys the school tracks', async () => {
    renderPage()
    expect(await screen.findByText('Preferred name')).toBeInTheDocument()
    expect(screen.getByText('Gryff')).toBeInTheDocument()
    expect(screen.getByText('Hobbies and interests')).toBeInTheDocument()
    expect(screen.getByText('Legos, soccer')).toBeInTheDocument()
    // extra profile key not in the standard set still shows up
    expect(screen.getByText('Carpool')).toBeInTheDocument()
    expect(screen.getByText('Tuesdays with the Smiths')).toBeInTheDocument()
  })

  it('renders the BOY/EOY assessment table from org-configured fields', async () => {
    renderPage()
    expect(await screen.findByText('Math CLE Book')).toBeInTheDocument()
    expect(screen.getByText('Beginning of year')).toBeInTheDocument()
    expect(screen.getByText('End of year')).toBeInTheDocument()
    expect(screen.getByText('Book 401')).toBeInTheDocument()
    expect(screen.getByText('Book 405')).toBeInTheDocument()
    // a configured field with no values still renders as a row
    expect(screen.getByText('Addition Facts')).toBeInTheDocument()
  })

  it('renders the materials checklist with paid/received state', async () => {
    renderPage()
    expect(await screen.findByText('Math CLE 401-405')).toBeInTheDocument()
    expect(screen.getByLabelText('Math CLE 401-405 paid: yes')).toBeInTheDocument()
    expect(screen.getByLabelText('Math CLE 401-405 received: no')).toBeInTheDocument()
    expect(screen.getByText('Ordered 8/1')).toBeInTheDocument()
  })

  it('renders per-class scores with the class average', async () => {
    renderPage()
    expect(await screen.findByText('Math')).toBeInTheDocument()
    expect(screen.getByText('Average: 92.5%')).toBeInTheDocument()
    expect(screen.getByText('Quiz 1')).toBeInTheDocument()
    expect(screen.getByText('9/10')).toBeInTheDocument()
  })

  it('has a print button and a goals link', async () => {
    renderPage()
    expect(await screen.findByText('Print')).toBeInTheDocument()
    expect(screen.getByText('Set goals').closest('a')).toHaveAttribute('href', '/family/goals')
  })

  it('shows the error state when the record cannot load', async () => {
    api.get.mockRejectedValueOnce({ response: { data: { error: 'Not authorized for this student' } } })
    renderPage()
    expect(await screen.findByText('Not authorized for this student')).toBeInTheDocument()
  })
})
