/**
 * The story panel under a credit item.
 *
 * Who sees it (a superadmin, at any stage), and the one thing it does since
 * 2026-09-15: bookmark the item for the Stories page. It used to draft and
 * publish from here; those tests went with the buttons. A story that already
 * exists shows its status and a link instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import api from '../../../services/api'
import GraderStoryPanel from './GraderStoryPanel'
import GraderView from './GraderView'
import { withConfirm } from '../../../tests/confirmTestUtils'

vi.mock('../../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('mammoth/mammoth.browser', () => ({
  default: { convertToHtml: async () => ({ value: '' }) },
}))

const ELIGIBLE = {
  success: true,
  consent: null,
  existing_story: null,
  is_story_candidate: false,
  credited: true,
  quest: { user_quest_id: 'uq1', title: 'Bridge', can_start: true, complete: true, task_count: 5, submitted_task_count: 5, credited_task_count: 5 },
  student_user_id: 'stu1',
  is_org_student: false,
}

let eligibility

const mockApi = () => {
  api.get.mockImplementation(async (url) => {
    if (url.startsWith('/api/admin/stories/eligibility/')) return { data: eligibility }
    return { data: { data: {} } }
  })
  api.post.mockImplementation(async (url, body) => {
    if (url === '/api/admin/stories/candidates/toggle') {
      return { data: { success: true, candidate: body.on ? { id: 'cand-1' } : null, is_story_candidate: !!body.on } }
    }
    return { data: { data: {} } }
  })
}

const renderPanel = (props = {}) => render(withConfirm(
  <GraderStoryPanel completionId="comp-1" {...props} />,
))

const toggleCalls = () => api.post.mock.calls.filter(([url]) => url === '/api/admin/stories/candidates/toggle')

beforeEach(() => {
  vi.clearAllMocks()
  eligibility = { ...ELIGIBLE }
  mockApi()
})

describe('where the panel appears', () => {
  const renderGrader = ({ role, status }) => {
    const detail = {
      completion: { id: 'comp-1', user_id: 'stu1', diploma_status: status, user_quest_task_id: 't1' },
      task: { id: 't1', title: 'Task', xp_value: 100, subject_xp_distribution: { math: 100 } },
      quest: { id: 'q1', title: 'Quest' },
      student: { display_name: 'Clare B' },
      evidence_blocks: [], review_rounds: [], suggested_subjects: { math: 100 },
      is_org_student: false,
    }
    return render(withConfirm(
      <GraderView
        item={{ completion_id: 'comp-1', student_id: 'stu1', xp_value: 100, diploma_status: status }}
        detail={detail}
        loading={false}
        studentContext={null}
        effectiveRole={role}
        index={0}
        total={1}
        onPrev={vi.fn()} onNext={vi.fn()} onExit={vi.fn()} onAdvance={vi.fn()} onRefresh={vi.fn()}
        feedbackTextareaRef={{ current: null }}
      />,
    ))
  }

  it('shows for a superadmin on a finalized item', async () => {
    renderGrader({ role: 'superadmin', status: 'finalized' })
    expect(screen.getByRole('region', { name: 'Story for www' })).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add to story review' })
  })

  it('is hidden for an org admin', () => {
    renderGrader({ role: 'org_admin', status: 'finalized' })
    expect(screen.queryByRole('region', { name: 'Story for www' })).toBeNull()
  })

  it('shows before credit is final too, since 2026-09-15', async () => {
    renderGrader({ role: 'superadmin', status: 'pending_review' })
    expect(screen.getByRole('region', { name: 'Story for www' })).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Add to story review' })
  })
})

describe('the bookmark', () => {
  it('is the only action: no publish, no whole quest, no draft', async () => {
    renderPanel()
    await screen.findByRole('button', { name: 'Add to story review' })
    expect(screen.queryByRole('button', { name: /publish/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /draft/i })).toBeNull()
    expect(screen.queryByText(/consent/i)).toBeNull()
  })

  it('flags the completion and then says it is in the queue', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Add to story review' }))
    await waitFor(() => expect(toggleCalls()).toHaveLength(1))
    expect(toggleCalls()[0][1]).toEqual({ target_type: 'task_completed', target_id: 'comp-1', on: true })
    await screen.findByTestId('story-flagged')
    expect(screen.getByRole('link', { name: 'Open Stories' })).toHaveAttribute('href', '/admin/stories')
    expect(screen.queryByRole('button', { name: 'Add to story review' })).toBeNull()
  })

  it('opens already in the queue when the feed bookmarked it first', async () => {
    eligibility = { ...ELIGIBLE, is_story_candidate: true }
    renderPanel()
    await screen.findByTestId('story-flagged')
    expect(screen.queryByRole('button', { name: 'Add to story review' })).toBeNull()
  })

  it('takes it back out on Remove', async () => {
    eligibility = { ...ELIGIBLE, is_story_candidate: true }
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(toggleCalls()).toHaveLength(1))
    expect(toggleCalls()[0][1]).toEqual({ target_type: 'task_completed', target_id: 'comp-1', on: false })
    await screen.findByRole('button', { name: 'Add to story review' })
  })

  it('stays unflagged and says so when the server refuses', async () => {
    const { toast } = await import('react-hot-toast')
    api.post.mockRejectedValueOnce({ response: { status: 404, data: { error: 'That feed item no longer exists.' } } })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Add to story review' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('That feed item no longer exists.'))
    expect(screen.getByRole('button', { name: 'Add to story review' })).toBeEnabled()
  })

  it('treats an org student like any other', async () => {
    eligibility = { ...ELIGIBLE, is_org_student: true }
    renderPanel()
    expect(await screen.findByRole('button', { name: 'Add to story review' })).toBeEnabled()
  })
})

describe('an existing story', () => {
  it('shows its status and a link instead of the bookmark', async () => {
    eligibility = { ...ELIGIBLE, existing_story: { id: 'st1', status: 'published', title: 'A fall of soccer', slug: 'a-fall-of-soccer' } }
    renderPanel()
    await screen.findByText('Published')
    expect(screen.getByText('A fall of soccer')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open story' })).toHaveAttribute('href', '/admin/stories/st1')
    expect(screen.queryByRole('button', { name: 'Add to story review' })).toBeNull()
  })

  it('labels one still in review as an editor link', async () => {
    eligibility = { ...ELIGIBLE, existing_story: { id: 'st1', status: 'review', title: 'A fall of soccer' } }
    renderPanel()
    await screen.findByText('Needs review')
    expect(screen.getByRole('link', { name: 'Open in editor' })).toHaveAttribute('href', '/admin/stories/st1')
  })

  it('uses the page handler for the link when one is given', async () => {
    eligibility = { ...ELIGIBLE, existing_story: { id: 'st1', status: 'review', title: 'A fall of soccer' } }
    const onOpenStory = vi.fn()
    renderPanel({ onOpenStory })
    fireEvent.click(await screen.findByRole('button', { name: 'Open in editor' }))
    expect(onOpenStory).toHaveBeenCalledWith('st1')
    expect(screen.queryByRole('link', { name: 'Open in editor' })).toBeNull()
  })
})

describe('when the check fails', () => {
  it('shows the error and no button', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 404, data: { error: 'Submission not found.' } } })
    renderPanel()
    await screen.findByText('Submission not found.')
    expect(screen.queryByRole('button', { name: 'Add to story review' })).toBeNull()
  })
})
