/**
 * An own-curriculum course (Courses and Credits) gets one quiet line in the
 * quest hero instead of a panel: its credit is the semester check-ins, and
 * tasks the family adds earn more.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import QuestDetailHeader from '../QuestDetailHeader'

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'parent-1' }, effectiveRole: 'student' }),
}))
vi.mock('../../../contexts/ConfirmContext', () => ({ useConfirm: () => vi.fn() }))
vi.mock('../../../hooks/api/useQuests', () => ({ useQuestEngagement: () => ({ data: null }) }))

const renderHeader = (quest) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <QuestDetailHeader quest={quest} earnedXP={0} isQuestCompleted={false} />
      </MemoryRouter>
    </QueryClientProvider>
  )

const base = { id: 'q1', title: 'Saxon Math 8/7', quest_type: 'class', transcript_subject: 'math' }

describe('quest hero, own-curriculum course', () => {
  it('says how the course earns credit and links to Courses and Credits', () => {
    renderHeader({ ...base, metadata: { course_format: 'own_curriculum', course_length: 'year' } })
    expect(screen.getByText(/semester check-ins earn this course's credit/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Courses and Credits' })).toHaveAttribute('href', '/courses-and-credits')
  })

  it('says nothing of the kind on any other quest', () => {
    renderHeader({ ...base, metadata: {} })
    expect(screen.queryByRole('link', { name: 'Courses and Credits' })).not.toBeInTheDocument()
  })
})

describe('quest hero with no picture', () => {
  it('shows the Optio brand banner with the official logo, not a stock image', () => {
    renderHeader({ ...base, metadata: {} })
    expect(screen.getByTestId('quest-brand-banner')).toBeInTheDocument()
    expect(screen.getByAltText('Optio').getAttribute('src')).toMatch(/site-assets\/logos\/logo_/)
  })

  it('uses the quest picture when there is one', () => {
    renderHeader({ ...base, metadata: {}, image_url: 'https://images.example/garden.jpg' })
    expect(screen.queryByTestId('quest-brand-banner')).not.toBeInTheDocument()
    expect(screen.getByAltText(base.title)).toHaveAttribute('src', 'https://images.example/garden.jpg')
  })
})
