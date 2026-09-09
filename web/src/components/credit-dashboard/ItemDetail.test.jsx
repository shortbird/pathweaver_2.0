import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}))

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import api from '../../services/api'
import ItemDetail from './ItemDetail'

const itemStub = {
  completion_id: 'comp-1',
  xp_value: 100,
  student_name: 'Clare B',
}

function renderDetail({ role, status, evidence_blocks = [], review_rounds = [] }) {
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
    },
    quest: { id: 'q1', title: 'Quest' },
    student: { display_name: 'Clare B' },
    evidence_blocks,
    review_rounds,
    suggested_subjects: { math: 100 },
    is_org_student: true,
  }
  return render(
    <ItemDetail
      item={itemStub}
      detail={detail}
      loading={false}
      effectiveRole={role}
      onRefresh={vi.fn()}
      onAdvance={vi.fn()}
      onGrowThis={vi.fn()}
      onFeedbackChange={vi.fn()}
      feedbackTextareaRef={{ current: null }}
    />,
  )
}

describe('ItemDetail — superadmin can review at any stage', () => {
  beforeEach(() => {
    api.post.mockClear()
  })

  it('shows an approve button for superadmin on pending_org_approval items', () => {
    renderDetail({ role: 'superadmin', status: 'pending_org_approval' })
    expect(screen.getByRole('button', { name: /^approve/i })).toBeInTheDocument()
  })

  it('approve button hits the collapsed /org-approve endpoint for superadmin', async () => {
    renderDetail({ role: 'superadmin', status: 'pending_org_approval' })
    const btn = screen.getByRole('button', { name: /^approve/i })
    fireEvent.click(btn)
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url] = api.post.mock.calls[0]
    // One-click collapse: hit /org-approve, which the backend routes
    // through the superadmin branch and lands the item at 'finalized'
    // in a single action (Optio is platform-accredited; superadmin is
    // the final stamp).
    expect(url).toMatch(/\/api\/credit-dashboard\/items\/comp-1\/org-approve$/)
  })

  it('superadmin on pending_org_approval can edit subject XP distribution', () => {
    renderDetail({ role: 'superadmin', status: 'pending_org_approval' })
    // The "Subject XP Distribution" editor is gated behind canEditSubjects
    // (canOrgAdminAct || canAdvisorAct). It must be visible for superadmin
    // at the org stage so they can adjust XP-per-subject in one click.
    expect(screen.getByText(/subject xp distribution/i)).toBeInTheDocument()
  })

  it('plain org_admin still sees the original "Approve for Optio Review" label', () => {
    renderDetail({ role: 'org_admin', status: 'pending_org_approval' })
    expect(
      screen.getByRole('button', { name: /approve for optio review/i }),
    ).toBeInTheDocument()
  })
})

describe('ItemDetail — evidence diff for resubmissions', () => {
  const baseBlock = (id, content) => ({
    id,
    block_type: 'text',
    content: { text: content },
  })

  it('shows no diff chrome on the initial submission (only one round)', () => {
    renderDetail({
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
    renderDetail({
      role: 'superadmin',
      status: 'pending_org_approval',
      evidence_blocks: current,
      review_rounds: [
        { round_number: 1, evidence_snapshot: prev, reviewer_action: 'grow_this' },
        { round_number: 2, evidence_snapshot: current },
      ],
    })

    // Summary header
    expect(screen.getByText(/vs\. round 1:/i)).toBeInTheDocument()
    expect(screen.getByText(/\+1 new/i)).toBeInTheDocument()
    expect(screen.getByText(/1 modified/i)).toBeInTheDocument()
    expect(screen.getByText(/−1 removed/i)).toBeInTheDocument()

    // Per-block badges
    expect(screen.getAllByText(/new since last review/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/modified since last review/i)).toBeInTheDocument()
    expect(screen.getByText(/removed since last review/i)).toBeInTheDocument()

    // Removed-blocks section header
    expect(screen.getByText(/removed since round 1 \(1\)/i)).toBeInTheDocument()
  })

  it('surfaces "no changes" when a resubmission has identical evidence', () => {
    const snap = [baseBlock('a', 'unchanged content')]
    renderDetail({
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
    renderDetail({
      role: 'superadmin',
      status: 'pending_org_approval',
      evidence_blocks: current,
      review_rounds: [
        { round_number: 1, evidence_snapshot: prev, reviewer_action: 'grow_this' },
        { round_number: 2, evidence_snapshot: current },
      ],
    })
    expect(screen.getByText('new text')).toBeInTheDocument()
    // Previous version is hidden by default
    expect(screen.queryByText('old text')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /view previous version/i }))
    expect(screen.getByText('old text')).toBeInTheDocument()
  })
})

describe('ItemDetail — evidence previews inline', () => {
  // Reviewers judge the work, so the work has to be on screen. These blocks
  // used to render as a bare "Video: ..." link and a "Download file" link,
  // which meant leaving the queue to see what was being credited.
  const block = (block_type, content, id = 'b1') => ({
    id, block_type, content, order_index: 0,
  })

  it('plays an uploaded video in the pane instead of linking out', () => {
    const { container } = renderDetail({
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
    const { container } = renderDetail({
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
    // Same lesson as the image-in-a-link-block fix: the block type is whichever
    // picker the student opened, not a fact about the URL.
    const { container } = renderDetail({
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
    const { container } = renderDetail({
      role: 'superadmin',
      status: 'pending_review',
      evidence_blocks: [block('document', {
        items: [{ url: 'https://x.supabase.co/storage/v1/object/sign/e/essay.pdf?token=t',
                  filename: 'essay.pdf' }],
      })],
    })
    // react-pdf renders asynchronously; the "Open" affordance and the absence of
    // the old bare download link are what this pane guarantees synchronously.
    expect(screen.getByLabelText('Open in new tab')).toBeTruthy()
    expect(container.textContent).not.toContain('Download file')
  })

  it('still offers a download for a format nothing can preview', () => {
    renderDetail({
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

  it('keeps a plain link a labelled link, never a raw URL', () => {
    renderDetail({
      role: 'superadmin',
      status: 'pending_review',
      evidence_blocks: [block('link', {
        items: [{ url: 'https://example.com/article', title: 'The article' }],
      })],
    })
    expect(screen.getByText('The article')).toBeTruthy()
  })
})
