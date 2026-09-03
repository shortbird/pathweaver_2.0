/**
 * Which engagement endpoint a quest card asks for depends on WHO is looking.
 *
 * The card used to decide with `!!studentId`, but every caller passes a
 * studentId — StudentOverviewPage passes the viewer's own id. So a student on
 * their own overview, and a teacher on a student's overview, both asked
 * /api/parent/:id/engagement, which verifies a guardian or observer link.
 * Both got 403 and a permanently blank "Ready to Begin" (Sentry OPTIO-WEB-6).
 */

import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const useQuestEngagement = vi.fn(() => ({ data: undefined }))
const useStudentQuestEngagement = vi.fn(() => ({ data: undefined }))

vi.mock('../../hooks/api/useQuests', () => ({
  useQuestEngagement: (...args) => useQuestEngagement(...args),
  useStudentQuestEngagement: (...args) => useStudentQuestEngagement(...args)
}))

vi.mock('../../contexts/ActingAsContext', () => ({
  useActingAs: () => ({ setActingAs: vi.fn() })
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'viewer-1' } })
}))

vi.mock('react-router-dom', () => ({
  Link: ({ children }) => <a>{children}</a>
}))

import LearningSnapshot from './LearningSnapshot'

const QUESTS = [{ quests: { id: 'quest-1', title: 'Build a Kite' } }]

beforeEach(() => {
  vi.clearAllMocks()
})

const renderAs = (viewerMode, studentId = 'student-9') =>
  render(
    <LearningSnapshot
      activeQuests={QUESTS}
      studentId={studentId}
      viewerMode={viewerMode}
      engagementData={{}}
    />
  )

/** The `enabled` flag the hook was called with. */
const enabledFor = (hook) => hook.mock.calls.at(-1)?.at(-1)?.enabled

describe('a student viewing their own overview', () => {
  it('reads their own engagement, not the parent endpoint', () => {
    renderAs('student', 'viewer-1')
    expect(enabledFor(useQuestEngagement)).toBe(true)
    expect(enabledFor(useStudentQuestEngagement)).toBe(false)
  })

  it('still reads their own engagement when studentId is their own id', () => {
    // The exact production shape: StudentOverviewPage passes effectiveUser.id.
    renderAs('student', 'viewer-1')
    expect(enabledFor(useStudentQuestEngagement)).toBe(false)
  })
})

describe('a guardian or observer viewing a child', () => {
  it('a parent reads the child-scoped endpoint', () => {
    renderAs('parent')
    expect(enabledFor(useStudentQuestEngagement)).toBe(true)
    expect(enabledFor(useQuestEngagement)).toBe(false)
  })

  it('an observer reads the child-scoped endpoint', () => {
    // verify_parent_access admits observers (allow_observer defaults true).
    renderAs('observer')
    expect(enabledFor(useStudentQuestEngagement)).toBe(true)
    expect(enabledFor(useQuestEngagement)).toBe(false)
  })
})

describe('a teacher viewing a student', () => {
  it('asks for neither, rather than 403ing on the parent endpoint', () => {
    // An advisor has no guardian link, so the parent endpoint would deny them;
    // the self endpoint would return the teacher's own activity, which is not
    // the student's. Neither is right, so the card shows its default state.
    renderAs('advisor')
    expect(enabledFor(useStudentQuestEngagement)).toBe(false)
    expect(enabledFor(useQuestEngagement)).toBe(false)
  })
})

describe('default', () => {
  it('treats an unspecified viewer as the student themselves', () => {
    render(
      <LearningSnapshot activeQuests={QUESTS} studentId="student-9" engagementData={{}} />
    )
    expect(enabledFor(useStudentQuestEngagement)).toBe(false)
    expect(enabledFor(useQuestEngagement)).toBe(true)
  })
})
