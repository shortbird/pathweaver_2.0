/**
 * The story panel under a finalized item.
 *
 * Who sees it (a superadmin, once credit is final), what one click sends, and
 * the three places the poll can land: published with the www link, review
 * with the blockers, failed with a retry. The consent chip and its record
 * form are here too, because the chip is the only warning about which tier
 * the story publishes in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
  quest: { user_quest_id: 'uq1', title: 'Bridge', complete: true, task_count: 5, finalized_count: 5 },
  student_user_id: 'stu1',
  is_org_student: false,
}

const storyAt = (status, extra = {}) => ({
  success: true,
  story: { id: 'st1', status, title: 'A fall of soccer', slug: 'a-fall-of-soccer', ...extra.story },
  assets: [],
  consent: null,
  blockers: extra.blockers || [],
  concerns: extra.concerns || [],
  marketing_url: extra.marketing_url || null,
})

let eligibility
let storyResponses

const mockApi = () => {
  api.get.mockImplementation(async (url) => {
    if (url.startsWith('/api/admin/stories/eligibility/')) return { data: eligibility }
    if (url.startsWith('/api/admin/stories/')) {
      const next = storyResponses.length > 1 ? storyResponses.shift() : storyResponses[0]
      return { data: next }
    }
    return { data: { data: {} } }
  })
  api.post.mockImplementation(async (url) => {
    if (url === '/api/admin/stories/publish') return { status: 202, data: storyAt('generating') }
    if (url.endsWith('/regenerate')) return { status: 202, data: storyAt('generating') }
    if (url === '/api/admin/stories/consents') {
      return { data: { success: true, consent: {
        id: 'c1', active: true, scope: { work: true, first_name: true, image_voice: false, age: false },
        source: 'written', granted_at: '2026-09-11T00:00:00Z',
      } } }
    }
    return { data: { data: {} } }
  })
}

const renderPanel = (props = {}) => render(withConfirm(
  <GraderStoryPanel completionId="comp-1" pollIntervalMs={5} {...props} />,
))

const publishCalls = () => api.post.mock.calls.filter(([url]) => url === '/api/admin/stories/publish')

beforeEach(() => {
  vi.clearAllMocks()
  eligibility = { ...ELIGIBLE }
  storyResponses = [storyAt('generating')]
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
    await screen.findByRole('button', { name: 'Publish story' })
  })

  it('is hidden for an org admin', () => {
    renderGrader({ role: 'org_admin', status: 'finalized' })
    expect(screen.queryByRole('region', { name: 'Story for www' })).toBeNull()
  })

  it('is hidden until credit is final', () => {
    renderGrader({ role: 'superadmin', status: 'pending_review' })
    expect(screen.queryByRole('region', { name: 'Story for www' })).toBeNull()
  })
})

describe('the buttons', () => {
  it('publishes the submission in auto mode', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Publish story' }))
    await waitFor(() => expect(publishCalls()).toHaveLength(1))
    expect(publishCalls()[0][1]).toEqual({
      source_type: 'credit_submission', source_id: 'comp-1', mode: 'auto',
    })
  })

  it('publishes the whole quest with its task count', async () => {
    renderPanel()
    const button = await screen.findByRole('button', { name: /Publish whole quest/ })
    expect(button).toHaveTextContent('(5 tasks)')
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(() => expect(publishCalls()).toHaveLength(1))
    expect(publishCalls()[0][1]).toEqual({ source_type: 'quest', source_id: 'uq1', mode: 'auto' })
  })

  it('cannot publish an unfinished quest', async () => {
    eligibility = { ...ELIGIBLE, quest: { ...ELIGIBLE.quest, complete: false, finalized_count: 3 } }
    renderPanel()
    const button = await screen.findByRole('button', { name: /Publish whole quest/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/3 of 5/))
  })

  it('drafts for review on the small link', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Draft for review instead' }))
    await waitFor(() => expect(publishCalls()).toHaveLength(1))
    expect(publishCalls()[0][1].mode).toBe('review')
  })

  it('treats an org student like any other', async () => {
    eligibility = { ...ELIGIBLE, is_org_student: true }
    renderPanel()
    expect(await screen.findByRole('button', { name: 'Publish story' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Draft for review instead' })).toBeEnabled()
  })

  it('offers the existing story instead of a second one', async () => {
    eligibility = { ...ELIGIBLE, existing_story: { id: 'st1', status: 'published', slug: 'a-fall-of-soccer' } }
    storyResponses = [storyAt('published', { marketing_url: 'https://www.optioeducation.com/stories/a-fall-of-soccer/' })]
    renderPanel()
    const link = await screen.findByRole('link', { name: 'Open story' })
    expect(link).toHaveAttribute('href', '/admin/stories/st1')
    expect(screen.queryByRole('button', { name: 'Publish story' })).toBeNull()
  })
})

describe('after the click', () => {
  it('polls until the story is published, then shows the link and the concerns', async () => {
    storyResponses = [
      storyAt('generating'),
      storyAt('published', {
        marketing_url: 'https://www.optioeducation.com/stories/a-fall-of-soccer/',
        concerns: ['The second photo shows a team jersey.'],
      }),
    ]
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Publish story' }))
    await screen.findByText('Published')
    expect(screen.getByRole('link', { name: 'View on www' }))
      .toHaveAttribute('href', 'https://www.optioeducation.com/stories/a-fall-of-soccer/')
    expect(screen.getByText('The second photo shows a team jersey.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open story' })).toHaveAttribute('href', '/admin/stories/st1')
  })

  it('lands in review with the blockers and an editor link', async () => {
    storyResponses = [
      storyAt('review', { blockers: [{ code: 'text_leak', field: 'dek', message: 'The dek names a town.' }] }),
    ]
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Publish story' }))
    await screen.findByText('Needs review')
    expect(screen.getByText('The dek names a town.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in editor' })).toHaveAttribute('href', '/admin/stories/st1')
  })

  it('uses the page handler for the editor link when one is given', async () => {
    storyResponses = [storyAt('review', { blockers: [] })]
    const onOpenStory = vi.fn()
    renderPanel({ onOpenStory })
    fireEvent.click(await screen.findByRole('button', { name: 'Publish story' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Open in editor' }))
    expect(onOpenStory).toHaveBeenCalledWith('st1')
    expect(screen.queryByRole('link', { name: 'Open in editor' })).toBeNull()
  })

  it('shows the failure and retries through regenerate', async () => {
    storyResponses = [storyAt('failed', { story: { error: 'Gemini timed out.' } })]
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Publish story' }))
    await screen.findByText('Gemini timed out.')
    storyResponses = [storyAt('published', { marketing_url: 'https://www.optioeducation.com/stories/x/' })]
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/admin/stories/st1/regenerate', {}))
    await screen.findByText('Published')
  })

  it('opens the existing story on a 409', async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'exists', error_detail: { code: 'STORY_EXISTS', message: 'exists', details: { existing_story_id: 'st1' } } } },
    })
    storyResponses = [storyAt('review')]
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Publish story' }))
    await screen.findByText('Needs review')
  })
})

describe('consent', () => {
  it('lists the granted scopes when consent is on file', async () => {
    eligibility = {
      ...ELIGIBLE,
      consent: {
        id: 'c1', active: true, source: 'academy_agreement', granted_at: '2026-09-01T00:00:00Z',
        scope: { work: true, first_name: true, image_voice: false, age: false },
      },
    }
    renderPanel()
    await screen.findByText('Consent on file: student work, first name')
    expect(screen.queryByRole('button', { name: 'Record consent' })).toBeNull()
  })

  it('says the story publishes anonymized when there is none, and records one inline', async () => {
    renderPanel()
    await screen.findByText('No consent recorded. The story publishes anonymized.')
    fireEvent.click(screen.getByRole('button', { name: 'Record consent' }))
    const form = screen.getByRole('form', { name: 'Record consent' })
    fireEvent.click(within(form).getByLabelText('First name'))
    fireEvent.change(within(form).getByLabelText('Source reference'), { target: { value: 'Email 2026-09-10' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Save consent' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/admin/stories/consents', expect.objectContaining({
      student_user_id: 'stu1',
      scope: { work: true, first_name: true, image_voice: false, age: false },
      source: 'written',
      source_ref: 'Email 2026-09-10',
    })))
    await screen.findByText('Consent on file: student work, first name')
  })

  it('will not record consent without a source reference', async () => {
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: 'Record consent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save consent' }))
    expect(api.post).not.toHaveBeenCalled()
  })
})
