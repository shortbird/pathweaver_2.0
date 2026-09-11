/**
 * The grader, by role and by stage.
 *
 * The first block is the one that has bitten before: a superadmin is both the
 * org approver and the Optio approver, so at the org stage their Approve has to
 * hit /org-approve (which the backend collapses to a finalize) and a plain org
 * admin's has to keep its "for Optio Review" label. The evidence blocks are the
 * same tests the old detail pane carried, because the grader took its renderer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import api from '../../../services/api'
import GraderView from './GraderView'
import { withConfirm } from '../../../tests/confirmTestUtils'

vi.mock('../../../services/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { success: true, messages: [] } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('mammoth/mammoth.browser', () => ({
  default: { convertToHtml: async () => ({ value: '<p>The essay body.</p>' }) },
}))

vi.stubGlobal('fetch', vi.fn(async () => ({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(8),
})))

const itemStub = {
  completion_id: 'comp-1',
  student_id: 'student-1',
  xp_value: 100,
  student_name: 'Clare B',
  task_title: 'Clare task',
}

function renderGrader({
  role, status, evidence_blocks = [], review_rounds = [], task = {}, props = {},
}) {
  const detail = {
    completion: {
      id: 'comp-1',
      user_id: 'student-1',
      diploma_status: status,
      user_quest_task_id: 'task-1',
    },
    task: {
      id: 'task-1',
      title: 'Clare task',
      xp_value: 100,
      diploma_subjects: ['math'],
      subject_xp_distribution: { math: 100 },
      ...task,
    },
    quest: { id: 'q1', title: 'Quest' },
    student: { display_name: 'Clare B' },
    evidence_blocks,
    review_rounds,
    suggested_subjects: { math: 100 },
    is_org_student: true,
  }
  return render(withConfirm(
    <GraderView
      item={{ ...itemStub, diploma_status: status }}
      detail={detail}
      loading={false}
      studentContext={null}
      effectiveRole={role}
      index={0}
      total={1}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onExit={vi.fn()}
      onAdvance={vi.fn()}
      onRefresh={vi.fn()}
      feedbackTextareaRef={{ current: null }}
      {...props}
    />,
  ))
}

beforeEach(() => {
  api.post.mockClear()
  api.get.mockClear()
})

describe('GraderView — superadmin can review at any stage', () => {
  it('shows an approve button for superadmin on pending_org_approval items', () => {
    renderGrader({ role: 'superadmin', status: 'pending_org_approval' })
    expect(screen.getByRole('button', { name: /^approve at 100 xp/i })).toBeInTheDocument()
  })

  it('approve button hits the collapsed /org-approve endpoint for superadmin', async () => {
    renderGrader({ role: 'superadmin', status: 'pending_org_approval' })
    fireEvent.click(screen.getByRole('button', { name: /^approve at 100 xp/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url] = api.post.mock.calls[0]
    expect(url).toMatch(/\/api\/credit-dashboard\/items\/comp-1\/org-approve$/)
  })

  it('approve at the Optio stage hits /approve', async () => {
    renderGrader({ role: 'superadmin', status: 'pending_review' })
    fireEvent.click(screen.getByRole('button', { name: /^approve at 100 xp/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][0]).toMatch(/\/comp-1\/approve$/)
  })

  it('superadmin on pending_org_approval can edit subject XP distribution', () => {
    renderGrader({ role: 'superadmin', status: 'pending_org_approval' })
    expect(screen.getByText(/subject xp distribution/i)).toBeInTheDocument()
    expect(screen.getByLabelText('XP for math')).toBeInTheDocument()
  })

  it('plain org_admin still sees the original "Approve for Optio Review" label', () => {
    renderGrader({ role: 'org_admin', status: 'pending_org_approval' })
    expect(
      screen.getByRole('button', { name: /approve for optio review/i }),
    ).toBeInTheDocument()
  })

  it('org_admin cannot set XP and sees no AI card', () => {
    renderGrader({ role: 'org_admin', status: 'pending_org_approval' })
    expect(screen.queryByLabelText('XP to award')).toBeNull()
    expect(screen.getByText(/Optio sets the final XP/)).toBeInTheDocument()
    expect(screen.queryByText(/AI recommendation/)).toBeNull()
  })

  it('offers no decision on a finalized item', () => {
    renderGrader({ role: 'superadmin', status: 'finalized' })
    expect(screen.queryByRole('button', { name: /^approve/i })).toBeNull()
    expect(screen.getByText(/Credit was approved/)).toBeInTheDocument()
  })
})

describe('GraderView — Grow This', () => {
  it('sends the note to /org-grow-this at the org stage', async () => {
    renderGrader({ role: 'org_admin', status: 'pending_org_approval' })
    fireEvent.change(screen.getByPlaceholderText(/feedback/i), { target: { value: 'More please' } })
    fireEvent.click(screen.getByRole('button', { name: /grow this/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toMatch(/\/comp-1\/org-grow-this$/)
    expect(body.feedback).toBe('More please')
  })

  it('refuses to send an empty note', async () => {
    const { toast } = await import('react-hot-toast')
    renderGrader({ role: 'superadmin', status: 'pending_review' })
    fireEvent.click(screen.getByRole('button', { name: /grow this/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/feedback is required/i)))
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('GraderView — the frame', () => {
  it('shows the position in the queue and disables the ends', () => {
    renderGrader({ role: 'superadmin', status: 'pending_review', props: { index: 0, total: 1 } })
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous item' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next item' })).toBeDisabled()
  })

  it('walks the queue with the arrows', () => {
    const onPrev = vi.fn()
    const onNext = vi.fn()
    renderGrader({ role: 'superadmin', status: 'pending_review',
                   props: { index: 1, total: 3, onPrev, onNext } })
    fireEvent.click(screen.getByRole('button', { name: 'Previous item' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next item' }))
    expect(onPrev).toHaveBeenCalled()
    expect(onNext).toHaveBeenCalled()
  })

  it('says so when a task set no Definition of Done', () => {
    renderGrader({ role: 'superadmin', status: 'pending_review' })
    expect(screen.getByText(/This task set no criteria/)).toBeInTheDocument()
  })

  it('lists the criteria when the task set them', () => {
    renderGrader({ role: 'superadmin', status: 'pending_review',
                   task: { success_criteria: ['Show the working', 'Name the result'] } })
    expect(screen.getByText('Show the working')).toBeInTheDocument()
    expect(screen.getByText('Name the result')).toBeInTheDocument()
  })

  it('waits for the detail to match the item before rendering it', () => {
    // The detail lags the item by one fetch; the previous student's evidence
    // must not render under this student's name.
    renderGrader({ role: 'superadmin', status: 'pending_review',
                   props: { item: { ...itemStub, completion_id: 'comp-2' } } })
    expect(screen.queryByRole('heading', { name: 'Clare task' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^approve/i })).toBeNull()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })
})

describe('GraderView — evidence diff for resubmissions', () => {
  const baseBlock = (id, content) => ({
    id,
    block_type: 'text',
    content: { text: content },
  })

  it('shows no diff chrome on the initial submission (only one round)', () => {
    renderGrader({
      role: 'superadmin',
      status: 'pending_org_approval',
      evidence_blocks: [baseBlock('a', 'hello')],
      review_rounds: [
        { round_number: 1, evidence_snapshot: [baseBlock('a', 'hello')] },
      ],
    })
    expect(screen.queryByText(/new since last review/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/no changes/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/vs\. round/i)).not.toBeInTheDocument()
  })

  it('flags added, modified, and removed blocks on a resubmission', () => {
    const prev = [
      baseBlock('a', 'original answer'),
      baseBlock('b', 'will be removed'),
    ]
    const current = [
      baseBlock('a', 'revised after feedback'), // modified
      baseBlock('c', 'fresh evidence'), // new
      // 'b' was removed
    ]
    renderGrader({
      role: 'superadmin',
      status: 'pending_org_approval',
      evidence_blocks: current,
      review_rounds: [
        { round_number: 1, evidence_snapshot: prev, reviewer_action: 'grow_this' },
        { round_number: 2, evidence_snapshot: current },
      ],
    })

    expect(screen.getByText(/vs\. round 1:/i)).toBeInTheDocument()
    expect(screen.getByText(/\+1 new/i)).toBeInTheDocument()
    expect(screen.getByText(/1 modified/i)).toBeInTheDocument()
    expect(screen.getByText(/−1 removed/i)).toBeInTheDocument()

    expect(screen.getAllByText(/new since last review/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/modified since last review/i)).toBeInTheDocument()
    expect(screen.getByText(/removed since last review/i)).toBeInTheDocument()

    expect(screen.getByText(/removed since round 1 \(1\)/i)).toBeInTheDocument()
  })

  it('surfaces "no changes" when a resubmission has identical evidence', () => {
    const snap = [baseBlock('a', 'unchanged content')]
    renderGrader({
      role: 'superadmin',
      status: 'pending_org_approval',
      evidence_blocks: snap,
      review_rounds: [
        { round_number: 1, evidence_snapshot: snap, reviewer_action: 'grow_this' },
        { round_number: 2, evidence_snapshot: snap },
      ],
    })
    expect(screen.getByText(/no changes/i)).toBeInTheDocument()
    expect(screen.queryByText(/new since last review/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/modified since last review/i)).not.toBeInTheDocument()
  })

  it('reveals the previous version of a modified block on demand', () => {
    const prev = [baseBlock('a', 'old text')]
    const current = [baseBlock('a', 'new text')]
    renderGrader({
      role: 'superadmin',
      status: 'pending_org_approval',
      evidence_blocks: current,
      review_rounds: [
        { round_number: 1, evidence_snapshot: prev, reviewer_action: 'grow_this' },
        { round_number: 2, evidence_snapshot: current },
      ],
    })
    expect(screen.getByText('new text')).toBeInTheDocument()
    expect(screen.queryByText('old text')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /view previous version/i }))
    expect(screen.getByText('old text')).toBeInTheDocument()
  })

  it('shows the previous round\'s feedback so the reviewer knows what was asked for', () => {
    renderGrader({
      role: 'superadmin',
      status: 'pending_review',
      evidence_blocks: [baseBlock('a', 'x')],
      review_rounds: [
        { round_number: 1, evidence_snapshot: [], reviewer_action: 'grow_this',
          reviewer_feedback: 'Add the measurements.' },
        { round_number: 2, evidence_snapshot: [baseBlock('a', 'x')] },
      ],
    })
    expect(screen.getByText('Add the measurements.')).toBeInTheDocument()
  })
})

describe('GraderView — evidence previews inline', () => {
  // Reviewers judge the work, so the work has to be on screen. These blocks
  // used to render as a bare "Video: ..." link and a "Download file" link,
  // which meant leaving the queue to see what was being credited.
  const block = (block_type, content, id = 'b1') => ({
    id, block_type, content, order_index: 0,
  })

  it('plays an uploaded video in the pane instead of linking out', () => {
    const { container } = renderGrader({
      role: 'superadmin',
      status: 'pending_review',
      evidence_blocks: [block('video', {
        items: [{ url: 'https://x.supabase.co/storage/v1/object/sign/e/clip.mp4?token=t' }],
      })],
    })
    const video = container.querySelector('video')
    expect(video).toBeTruthy()
    expect(video.getAttribute('controls')).not.toBeNull()
    expect(video.getAttribute('src')).toContain('clip.mp4')
  })

  it('embeds a YouTube video rather than showing its URL', () => {
    const { container } = renderGrader({
      role: 'superadmin',
      status: 'pending_review',
      evidence_blocks: [block('video', {
        items: [{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
      })],
    })
    const iframe = container.querySelector('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe.getAttribute('src')).toContain('/embed/dQw4w9WgXcQ')
  })

  it('embeds a video pasted into the Link picker', () => {
    const { container } = renderGrader({
      role: 'superadmin',
      status: 'pending_review',
      evidence_blocks: [block('link', {
        items: [{ url: 'https://vimeo.com/76979871', title: 'My demo' }],
      })],
    })
    const iframe = container.querySelector('iframe')
    expect(iframe).toBeTruthy()
    expect(iframe.getAttribute('src')).toContain('player.vimeo.com/video/76979871')
  })

  it('renders a PDF document through the inline previewer', () => {
    const { container } = renderGrader({
      role: 'superadmin',
      status: 'pending_review',
      evidence_blocks: [block('document', {
        items: [{ url: 'https://x.supabase.co/storage/v1/object/sign/e/essay.pdf?token=t',
                  filename: 'essay.pdf' }],
      })],
    })
    expect(screen.getByLabelText('Open in new tab')).toBeTruthy()
    expect(container.textContent).not.toContain('Download file')
  })

  it('still offers a download for a format nothing can preview', () => {
    renderGrader({
      role: 'superadmin',
      status: 'pending_review',
      evidence_blocks: [block('document', {
        items: [{ url: 'https://x.supabase.co/storage/v1/object/sign/e/sheet.xlsx?token=t',
                  filename: 'sheet.xlsx' }],
      })],
    })
    expect(screen.getByText('sheet.xlsx')).toBeTruthy()
    expect(screen.getByText('Click to download')).toBeTruthy()
  })

  it('shows a linked page in a frame, with a way out to a new tab', () => {
    const { container } = renderGrader({
      role: 'superadmin',
      status: 'pending_review',
      evidence_blocks: [block('link', {
        items: [{ url: 'https://docs.google.com/document/d/abc/edit', title: 'The essay' }],
      })],
    })
    expect(screen.getByText('The essay')).toBeTruthy()
    const iframe = container.querySelector('iframe')
    expect(iframe).toBeTruthy()
    // The editor refuses to be framed; the viewer does not.
    expect(iframe.getAttribute('src')).toBe('https://docs.google.com/document/d/abc/preview')
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts')
    expect(screen.getByLabelText('Open in new tab').getAttribute('href'))
      .toBe('https://docs.google.com/document/d/abc/edit')
  })

  it('reads a PDF pasted into the Link picker instead of linking out', () => {
    renderGrader({
      role: 'superadmin',
      status: 'pending_review',
      evidence_blocks: [block('link', {
        items: [{ url: 'https://x.supabase.co/storage/v1/object/sign/e/essay.pdf?token=t' }],
      })],
    })
    expect(screen.getByLabelText('Open in new tab')).toBeTruthy()
    expect(screen.queryByText(/Click to download/)).toBeNull()
  })

  it('renders a Word document in the page rather than as a download', async () => {
    const { default: DocxPreview } = await import('../../evidence/preview/DocxPreview')
    expect(DocxPreview).toBeTruthy()
    renderGrader({
      role: 'superadmin',
      status: 'pending_review',
      evidence_blocks: [block('document', {
        items: [{ url: 'https://x.supabase.co/storage/v1/object/sign/e/essay.docx?token=t',
                  filename: 'essay.docx' }],
      })],
    })
    expect(await screen.findByText('The essay body.')).toBeTruthy()
    expect(screen.getByText('essay.docx')).toBeTruthy()
    expect(screen.queryByText(/Click to download/)).toBeNull()
    expect(screen.getByText('Download').closest('a').getAttribute('href')).toContain('essay.docx')
  })
})
