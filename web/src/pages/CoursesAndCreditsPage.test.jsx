import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import CoursesAndCreditsPage from './CoursesAndCreditsPage'

// A parent, scoped to Ada unless a test clears it.
let scope = { studentId: 'kid-1', studentName: 'Ada' }
vi.mock('../hooks/useStudentScope', () => ({
  useStudentScope: () => ({
    params: scope.studentId ? { student_id: scope.studentId } : {},
    studentId: scope.studentId,
    scopeId: scope.studentId || undefined,
    studentName: scope.studentName,
    isDelegated: !!scope.studentId,
  }),
}))

const enterScope = vi.fn()
vi.mock('../contexts/FamilyScopeContext', () => ({
  useFamilyScope: () => ({ enterScope }),
  worksThroughFamily: () => true,
}))
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'parent-1', role: 'parent' } }) }))
let schoolOrg = null
vi.mock('../hooks/api/useSchoolContext', () => ({
  useFamilyOrgSelection: () => ({ students: [{ student_id: 'kid-1', name: 'Ada' }], org: schoolOrg, loading: false }),
}))

// The prior-learning uploader has its own tests (familyPriorLearning.test.jsx);
// here it only matters that the page embeds it, for which child.
vi.mock('./FamilyPriorLearningPage', () => ({
  default: ({ studentId }) => <div data-testid="prior-learning-panel" data-student={studentId} />,
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const apiGet = vi.fn()
const apiPost = vi.fn()
vi.mock('../services/api', () => ({
  default: { get: (...a) => apiGet(...a), post: (...a) => apiPost(...a) },
}))

vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const SUBJECT_KEYS = [
  'language_arts', 'math', 'science', 'social_studies', 'financial_literacy', 'health',
  'pe', 'fine_arts', 'cte', 'digital_literacy', 'electives',
]

const subject = (key, extra = {}) => ({
  key,
  name: key === 'math' ? 'Math' : key,
  description: null,
  earned_xp: 0,
  pending_xp: 0,
  sources: { own_curriculum: 0, optio_classes: 0, quests: 0, transfer: 0, other: 0 },
  courses: [],
  ...extra,
})

const PLAN = {
  course_lengths: [
    { key: 'semester', label: 'One semester', check_ins: 1, credits: 0.5, xp: 1000 },
    { key: 'year', label: 'Full year', check_ins: 2, credits: 1, xp: 2000 },
  ],
  subjects: SUBJECT_KEYS.map((k) =>
    k === 'math'
      ? subject('math', {
          earned_xp: 2000,
          pending_xp: 1000,
          sources: { own_curriculum: 1000, optio_classes: 0, quests: 500, transfer: 500, other: 0 },
          courses: [{
            kind: 'own',
            quest_id: 'q1',
            title: 'Saxon Math 8/7',
            length: 'year',
            length_label: 'Full year',
            credits: 1,
            status: 'in_review',
            check_ins: [
              { task_id: 't1', title: 'First semester check-in', xp: 1000, state: 'approved', feedback: null },
              { task_id: 't2', title: 'Second semester check-in', xp: 1000, state: 'needs_more', feedback: 'Add the tests.' },
            ],
            added_tasks: 2,
            added_tasks_approved: 1,
          }],
        })
      : subject(k)
  ),
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CoursesAndCreditsPage />
    </MemoryRouter>
  )
}

describe('CoursesAndCreditsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scope = { studentId: 'kid-1', studentName: 'Ada' }
    schoolOrg = null
    apiGet.mockResolvedValue({ data: { data: PLAN } })
    apiPost.mockResolvedValue({ data: { data: { quest_id: 'q-new' } } })
  })

  it('picks the first student for a parent who arrives from the school page with none chosen', async () => {
    scope = { studentId: null, studentName: null }
    renderPage()
    await waitFor(() => expect(enterScope).toHaveBeenCalledWith('kid-1'))
    // Never the parent's own (empty) plan.
    expect(apiGet).not.toHaveBeenCalled()
  })

  it("loads the child's plan and shows credit the shared arithmetic counts", async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: "Ada's courses and credits" })).toBeInTheDocument()
    expect(apiGet).toHaveBeenCalledWith('/api/courses-and-credits', { params: { student_id: 'kid-1' } })
    expect(screen.getByText(/credits toward Ada's diploma/)).toBeInTheDocument()

    const math = screen.getByRole('region', { name: /math/i })
    // 2,000 XP = 1 credit of the 3 Math needs: XP first, credits beside it.
    expect(within(math).getByText('2,000')).toBeInTheDocument()
    expect(within(math).getByText(/of 6,000 XP/)).toBeInTheDocument()
    expect(within(math).getByText('1 of 3 credits')).toBeInTheDocument()
    // Waiting on review is the yellow part of the bar, not a line of text.
    expect(within(math).getByRole('img', { name: '1,000 XP waiting on review' })).toBeInTheDocument()
    expect(within(math).queryByText(/waiting on review/i)).not.toBeInTheDocument()
    const key = screen.getByRole('list', { name: 'Progress bar key' })
    expect(within(key).getByText('Recorded on Optio transcript')).toBeInTheDocument()
    expect(within(key).getByText('Pending Optio approval')).toBeInTheDocument()
    expect(within(math).getByText(/first semester check-in approved/i)).toBeInTheDocument()
    expect(within(math).getByRole('button', { name: /add more to second semester check-in/i })).toBeInTheDocument()
  })

  it('shows where each subject\'s credit came from, and the ways to earn more', async () => {
    renderPage()
    const math = await screen.findByRole('region', { name: /math/i })
    // The per-source line is gone (2026-09-28); the quests and courses listed
    // under the subject say where its XP came from.
    expect(within(math).queryByText(/earned from/i)).not.toBeInTheDocument()
    // The course is a quest the family can add tasks to.
    expect(within(math).getByText(/2 tasks added, 1 approved for credit/i)).toBeInTheDocument()
    expect(within(math).getByRole('link', { name: 'Saxon Math 8/7' })).toHaveAttribute('href', '/quests/q1')
    // One way to add to a subject (2026-09-28): quests are found from the top.
    expect(within(math).queryByRole('link', { name: /find a quest/i })).not.toBeInTheDocument()
  })

  // The ways to earn XP are behind the info icon, not a box on the page.
  it('opens the ways to earn XP from the info icon', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('region', { name: /math/i })
    expect(screen.queryByRole('heading', { name: /ways to earn XP/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'How to earn XP' }))
    expect(screen.getByRole('heading', { name: /two ways to earn XP/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse quests/i })).toHaveAttribute('href', '/quests')
  })

  it('folds prior learning in as a third way and a section, where the school takes it', async () => {
    // It was its own school tab until 2026-09-28. Accepted records come back
    // as transfer credit in this page's subjects, so they share one page.
    schoolOrg = { organization_id: 'org-1', prior_learning_enabled: true }
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'How to earn XP' }))
    expect(screen.getByRole('heading', { name: /three ways to earn XP/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send records/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /learning from before optio/i, level: 2 })).toBeInTheDocument()
    expect(screen.getByTestId('prior-learning-panel')).toHaveAttribute('data-student', 'kid-1')
  })

  it('offers no prior learning where the school does not take it', async () => {
    schoolOrg = { organization_id: 'org-1', prior_learning_enabled: false }
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'How to earn XP' }))
    expect(screen.getByRole('heading', { name: /two ways to earn XP/i })).toBeInTheDocument()
    expect(screen.queryByTestId('prior-learning-panel')).not.toBeInTheDocument()
  })

  it('opens a sent-back check-in with the reviewer note on top', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /add more to second semester check-in/i }))
    expect(await screen.findByText('Add the tests.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send for review/i })).toBeDisabled()
  })

  // "+ Add a quest", then own curriculum or an Optio quest (2026-09-28). The
  // page never says "course"; there is no Optio class option.
  it('asks own curriculum or Optio quest first, and sends a quest to the library', async () => {
    const user = userEvent.setup()
    renderPage()
    const math = await screen.findByRole('region', { name: /math/i })
    await user.click(within(math).getByRole('button', { name: /add a quest/i }))

    expect(screen.getByRole('heading', { name: 'Add a Math quest' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /your own curriculum/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /optio class/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /an optio quest/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/quests')
  })

  it('adds an own-curriculum quest for the child in three fields', async () => {
    const user = userEvent.setup()
    renderPage()
    const math = await screen.findByRole('region', { name: /math/i })
    await user.click(within(math).getByRole('button', { name: /add a quest/i }))
    await user.click(screen.getByRole('button', { name: /your own curriculum/i }))

    const add = screen.getByRole('button', { name: 'Add to Math' })
    expect(add).toBeDisabled()
    await user.type(screen.getByLabelText(/what is it called/i), 'Saxon Algebra 1')
    await user.click(screen.getByRole('button', { name: /full year/i }))
    await user.click(add)

    await waitFor(() => expect(apiPost).toHaveBeenCalled())
    expect(apiPost).toHaveBeenCalledWith('/api/courses-and-credits/courses', {
      title: 'Saxon Algebra 1',
      subject: 'math',
      length: 'year',
      curriculum: undefined,
      student_id: 'kid-1',
    })
    // The plan reloads so the new course shows up.
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2))
  })
})

// A quest with approved credit shows under each subject it counted toward,
// naming the others, with that subject's tasks opening inline (2026-09-28).
describe('CoursesAndCreditsPage quests by subject', () => {
  const garden = {
    quest_id: 'garden',
    title: 'Backyard Garden',
    xp: 25,
    also_counted_toward: [{ key: 'science', name: 'Science', xp: 50 }],
    tasks: [{ id: 'plan', title: 'Sketch a planting plan', xp: 25 }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    scope = { studentId: 'kid-1', studentName: 'Ada' }
    apiGet.mockResolvedValue({
      data: {
        data: {
          ...PLAN,
          subjects: PLAN.subjects.map((s) => (s.key === 'math' ? { ...s, quests: [garden] } : s)),
        },
      },
    })
  })

  it('lists the quest with what it also counted toward', async () => {
    renderPage()
    const math = await screen.findByRole('region', { name: /math/i })
    const quests = within(math).getByRole('list', { name: /quests that earned math credit/i })
    expect(within(quests).getByRole('link', { name: 'Backyard Garden' })).toHaveAttribute('href', '/quests/garden')
    expect(within(quests).getByText('25 XP here')).toBeInTheDocument()
    expect(within(quests).getByText(/also counted toward/i)).toHaveTextContent('Also counted toward Science (50 XP)')
  })

  it('opens the approved tasks inline', async () => {
    const user = userEvent.setup()
    renderPage()
    const math = await screen.findByRole('region', { name: /math/i })
    expect(within(math).queryByText('Sketch a planting plan')).not.toBeInTheDocument()

    await user.click(within(math).getByRole('button', { name: /1 approved task/i }))
    expect(within(math).getByText('Sketch a planting plan')).toBeInTheDocument()
  })

  it('shows no quest list for a subject without approved quest credit', async () => {
    renderPage()
    await screen.findByRole('region', { name: /math/i })
    expect(screen.getAllByRole('list', { name: /quests that earned/i })).toHaveLength(1)
  })
})

// Every required subject at a glance, above the subject cards (2026-09-28).
describe('CoursesAndCreditsPage required subjects overview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scope = { studentId: 'kid-1', studentName: 'Ada' }
    apiGet.mockResolvedValue({ data: { data: PLAN } })
  })

  it('shows a tile per required subject with its XP progress', async () => {
    renderPage()
    const overview = await screen.findByRole('region', { name: 'Required subjects' })
    expect(within(overview).getAllByRole('button')).toHaveLength(SUBJECT_KEYS.length)
    const math = within(overview).getByRole('button', { name: /^Math/ })
    expect(math).toHaveTextContent('2,000 / 6,000 XP')
    expect(math).toHaveTextContent('33%')
    // Math's pending XP is the yellow part of its tile bar too.
    expect(within(math).getByRole('img', { name: '1,000 XP waiting on review' })).toBeInTheDocument()
    expect(within(overview).getByText(`0 of ${SUBJECT_KEYS.length} complete`)).toBeInTheDocument()
  })

  // Electives takes other subjects' extra XP, so it is its own full-width row
  // under an even grid of the other ten.
  it('sets Electives apart as the overflow row', async () => {
    renderPage()
    const overview = await screen.findByRole('region', { name: 'Required subjects' })
    const grid = within(overview).getByRole('list')
    expect(within(grid).getAllByRole('button')).toHaveLength(SUBJECT_KEYS.length - 1)
    expect(within(grid).queryByRole('button', { name: /^electives/ })).not.toBeInTheDocument()
    expect(within(overview).getByRole('button', { name: /^electives/ }))
      .toHaveTextContent('Extra XP from any subject counts here')
  })

  it('jumps to the subject card when a tile is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    const overview = await screen.findByRole('region', { name: 'Required subjects' })
    const card = document.getElementById('subject-card-math')
    card.scrollIntoView = vi.fn()

    await user.click(within(overview).getByRole('button', { name: /^Math/ }))
    expect(card.scrollIntoView).toHaveBeenCalled()
  })
})
