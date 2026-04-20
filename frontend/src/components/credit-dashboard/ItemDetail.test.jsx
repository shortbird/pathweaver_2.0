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

function renderDetail({ role, status }) {
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
    evidence_blocks: [],
    review_rounds: [],
    accreditor_reviews: [],
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
    // through the superadmin branch and lands the item at approved +
    // pending_accreditor in a single action.
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
