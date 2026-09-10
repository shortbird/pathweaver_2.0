import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

/**
 * DiplomaPage: who is looking, and what they are allowed to see.
 *
 * 962 lines, 71 commits, and the same two things keep breaking.
 *
 * ONE — `isOwner`. It is a single boolean expression, and it decides the share
 * bar, the FERPA privacy toggle, the possessive in every sentence on the page,
 * and which name the sidebar carries. Its repair history is four commits long:
 * "debug: Add console logging to diagnose isOwner calculation for public
 * viewers", "fix: Ensure isOwner is always boolean to fix public viewer text
 * display", "fix: Update diploma page copy to use third-person for public
 * viewers", "Fix: Prevent dependent users from accessing parent dashboard and
 * show correct name on diploma". A viewer wrongly treated as the owner is
 * offered controls over a child's privacy settings that are not theirs.
 *
 * TWO — the two public routes. `/portfolio/:slug` and `/public/diploma/:userId`
 * are the same page fed by the same backend payload, and they had two separate
 * unpackers. The slug one set only the student and the curated picks, so a
 * shared portfolio rendered with no pillars, no credits and no evidence:
 * "Public portfolio links have been broken in production since February".
 * `applyDiplomaPayload` is now one extractor, and this pins the two routes to
 * the same result so they cannot drift apart again.
 *
 * The five per-section fetches are covered by diplomaSectionFailures.test.jsx,
 * which tests the reporting rule rather than the page.
 */

const mockNavigate = vi.fn()
let authState = {}
let actingAsState = {}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState
}))

vi.mock('../../contexts/ActingAsContext', () => ({
  useActingAs: () => actingAsState
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() }
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() }
}))

vi.mock('../../utils/logger', () => ({
  default: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))

// --- Child components, reduced to the props this page is responsible for ---

vi.mock('../../components/diploma/DiplomaHead', () => ({
  default: ({ pageTitle, canonicalUrl }) => (
    <div data-testid="head" data-canonical={canonicalUrl}>{pageTitle}</div>
  )
}))

vi.mock('../../components/diploma/DiplomaHero', () => ({
  default: ({ getStudentName }) => <h1 data-testid="hero">{getStudentName()}</h1>
}))

vi.mock('../../components/diploma/DiplomaShareControls', () => ({
  default: ({ isOwner, visibilityStatus, handlePrivacyToggle, copyShareLink }) => (
    <div data-testid="share-controls" data-is-owner={String(isOwner)}>
      {isOwner && (
        <>
          <button data-testid="privacy-toggle" onClick={handlePrivacyToggle}>
            {visibilityStatus?.is_public ? 'Make private' : 'Make public'}
          </button>
          <button data-testid="copy-link" onClick={copyShareLink}>Copy link</button>
        </>
      )}
    </div>
  )
}))

vi.mock('../../components/diploma/DiplomaModals', () => ({
  default: ({ showConsentModal, handleConsentConfirm, subjectXP, pendingSubjectXP }) => (
    <div data-testid="modals" data-subject-xp={JSON.stringify(subjectXP)}
         data-pending-xp={JSON.stringify(pendingSubjectXP)}>
      {showConsentModal && (
        <button data-testid="consent-confirm" onClick={handleConsentConfirm}>I consent</button>
      )}
    </div>
  )
}))

vi.mock('../../components/diploma/CompactSidebar', () => ({
  default: ({ totalXP, subjectXP, isOwner, studentName, dateOfBirth, totalXPCount }) => (
    <div
      data-testid="sidebar"
      data-is-owner={String(isOwner)}
      data-student-name={studentName}
      data-dob={dateOfBirth || ''}
      data-total-xp={String(totalXPCount)}
      data-pillars={JSON.stringify(totalXP)}
      data-subjects={JSON.stringify(subjectXP)}
    />
  )
}))

vi.mock('../../components/diploma/EvidenceMasonryGallery', () => ({
  default: ({ achievements }) => (
    <div data-testid="gallery" data-count={String(achievements.length)}>
      {achievements.map(a => <span key={a.quest_id}>{a.quest_title}</span>)}
    </div>
  )
}))

vi.mock('../../components/diploma/TransferCreditsCard', () => ({
  default: ({ transferCredits }) => (
    <div data-testid="transfer-credits">{transferCredits.institution_name}</div>
  )
}))

vi.mock('../../components/diploma/PublicNoticeBanner', () => ({
  default: ({ studentName }) => <div data-testid="public-notice">{studentName}</div>
}))

vi.mock('../../components/learning-events/LearningEventCard', () => ({
  default: ({ event }) => <div data-testid={`event-${event.id}`}>{event.title}</div>
}))

import DiplomaPage from '../DiplomaPage'
import api from '../../services/api'

/** The shape /api/portfolio/public/:slug and /api/portfolio/diploma/:id return. */
const DIPLOMA_PAYLOAD = {
  student: {
    id: 'student-9',
    first_name: 'Emma',
    last_name: 'Ruiz',
    portfolio_slug: 'emma-ruiz',
    date_of_birth: '2015-04-02'
  },
  total_xp: 1800,
  achievements: [
    { quest_id: 'q-1', quest_title: 'Build a Weather Station', task_evidence: {} },
    { quest_id: 'q-2', quest_title: 'Neighbourhood Oral History', task_evidence: {} }
  ],
  skill_xp: { stem: 1000, communication: 800 },
  subject_xp: [
    { school_subject: 'science', xp_amount: 1000 },
    { school_subject: 'language_arts', xp_amount: 800 }
  ],
  transfer_credits: { id: 'tc-1', institution_name: 'Cedar Valley High', total_credits: 4 },
  curated: []
}

/**
 * Route the page the way the app does. Four real routes reach this component:
 *   /diploma               owner, no params
 *   /diploma/:userId       a named user
 *   /public/diploma/:userId  the public link
 *   /portfolio/:slug       the public link by slug
 */
function renderDiploma(path) {
  window.history.replaceState({}, '', path)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/diploma" element={<DiplomaPage />} />
        <Route path="/diploma/:userId" element={<DiplomaPage />} />
        <Route path="/public/diploma/:userId" element={<DiplomaPage />} />
        <Route path="/portfolio/:slug" element={<DiplomaPage />} />
      </Routes>
    </MemoryRouter>
  )
}

/** Answer the own-diploma fetches with empty-but-valid payloads. */
function stubOwnerFetches(overrides = {}) {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/api/quests/completed')) {
      return Promise.resolve({ data: { achievements: [] } })
    }
    if (url.startsWith('/api/users/dashboard')) {
      return Promise.resolve({ data: { xp_by_category: {}, stats: { total_xp: 0 } } })
    }
    if (url.startsWith('/api/users/subject-xp')) {
      return Promise.resolve({ data: { subject_xp: overrides.subjectXP || [] } })
    }
    if (url.startsWith('/api/credits/transfer-credits')) {
      return Promise.resolve({ data: {} })
    }
    if (url.startsWith('/api/portfolio/completions/curated')) {
      return Promise.resolve({ data: { curated: [] } })
    }
    if (url.includes('/visibility-status')) {
      return Promise.resolve({ data: { data: overrides.visibility || { is_public: false } } })
    }
    if (url.startsWith('/api/learning-events')) {
      return Promise.resolve({ data: { events: [] } })
    }
    return Promise.resolve({ data: {} })
  })
}

describe('DiplomaPage — who is looking', () => {
  const ME = { id: 'me-1', first_name: 'Sam', last_name: 'Doe', date_of_birth: '2009-01-01' }

  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: ME, loginTimestamp: 1 }
    actingAsState = { actingAsDependent: null }
    stubOwnerFetches()
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('treats the logged-in student as the owner of /diploma', async () => {
    renderDiploma('/diploma')
    const controls = await screen.findByTestId('share-controls')
    expect(controls).toHaveAttribute('data-is-owner', 'true')
    expect(screen.getByTestId('privacy-toggle')).toBeInTheDocument()
  })

  it('does NOT treat them as the owner on the public link to their own diploma', async () => {
    // /public/* is the shared, indexable view. Someone who happens to be signed
    // in as that student is previewing what a stranger sees, and must not be
    // offered the privacy controls in that view -- the page has its own
    // preview toggle for the owner view.
    api.get.mockResolvedValue({ data: { ...DIPLOMA_PAYLOAD, student: { ...DIPLOMA_PAYLOAD.student, id: 'me-1' } } })
    renderDiploma('/public/diploma/me-1')
    const controls = await screen.findByTestId('share-controls')
    expect(controls).toHaveAttribute('data-is-owner', 'false')
    expect(screen.queryByTestId('privacy-toggle')).not.toBeInTheDocument()
  })

  it('does NOT treat a signed-in viewer as the owner of a portfolio slug', async () => {
    api.get.mockResolvedValue({ data: DIPLOMA_PAYLOAD })
    renderDiploma('/portfolio/emma-ruiz')
    const controls = await screen.findByTestId('share-controls')
    expect(controls).toHaveAttribute('data-is-owner', 'false')
  })

  it('does NOT treat one student as the owner of another student\'s diploma', async () => {
    api.get.mockResolvedValue({ data: DIPLOMA_PAYLOAD })
    renderDiploma('/diploma/student-9')
    const controls = await screen.findByTestId('share-controls')
    expect(controls).toHaveAttribute('data-is-owner', 'false')
  })

  it('treats a parent acting as their child as the owner of the child\'s diploma', async () => {
    // The parent is managing the child's account. b87af63e / 3cf90c0e: the page
    // showed the PARENT's name here, on the child's diploma.
    actingAsState = {
      actingAsDependent: { id: 'kid-3', first_name: 'Rory', last_name: 'Doe' }
    }
    renderDiploma('/diploma')
    const controls = await screen.findByTestId('share-controls')
    expect(controls).toHaveAttribute('data-is-owner', 'true')
    expect(screen.getByTestId('hero')).toHaveTextContent('Rory Doe')
  })

  it('builds the share link for the child, not the parent', async () => {
    // ef73a3bd. A parent acting as their child who copies the share link and
    // sends it to a grandparent must not be sending their own portfolio.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    actingAsState = { actingAsDependent: { id: 'kid-3', first_name: 'Rory' } }

    renderDiploma('/diploma')
    fireEvent.click(await screen.findByTestId('copy-link'))

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText.mock.calls[0][0]).toContain('/public/diploma/kid-3')
    expect(writeText.mock.calls[0][0]).not.toContain('me-1')
  })

  it('names the student in the third person for a viewer who is not the owner', async () => {
    api.get.mockResolvedValue({ data: { ...DIPLOMA_PAYLOAD, achievements: [] } })
    renderDiploma('/portfolio/emma-ruiz')
    expect(await screen.findByText(/Emma hasn't submitted any evidence yet/)).toBeInTheDocument()
  })

  it('addresses the owner directly', async () => {
    renderDiploma('/diploma')
    expect(await screen.findByText(/Start your learning journey/)).toBeInTheDocument()
  })

  it('shows the sidebar the STUDENT\'s birthday, not the viewer\'s', async () => {
    // The age view decides whether a 9-year-old sees pillars or credits. It is
    // a property of whose diploma this is, so a parent reading their child's
    // page sees what the child sees.
    api.get.mockResolvedValue({ data: DIPLOMA_PAYLOAD })
    renderDiploma('/portfolio/emma-ruiz')
    const sidebar = await screen.findByTestId('sidebar')
    await waitFor(() => expect(sidebar).toHaveAttribute('data-dob', '2015-04-02'))
  })
})

describe('DiplomaPage — the two public routes unpack identically', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: null, loginTimestamp: 0 }
    actingAsState = { actingAsDependent: null }
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  /** Every section the payload carries, asserted on the rendered page. */
  const expectFullyPopulated = async () => {
    const sidebar = await screen.findByTestId('sidebar')
    await waitFor(() => {
      expect(JSON.parse(sidebar.getAttribute('data-pillars')))
        .toEqual({ stem: 1000, communication: 800 })
    })
    expect(JSON.parse(sidebar.getAttribute('data-subjects')))
      .toEqual({ science: 1000, language_arts: 800 })
    expect(sidebar).toHaveAttribute('data-total-xp', '1800')
    expect(screen.getByTestId('gallery')).toHaveAttribute('data-count', '2')
    expect(screen.getByText('Build a Weather Station')).toBeInTheDocument()
    expect(screen.getByTestId('transfer-credits')).toHaveTextContent('Cedar Valley High')
  }

  it('renders every section on /portfolio/:slug', async () => {
    // This is the one that shipped broken: the slug handler set only the
    // student and the curated picks, so the page rendered with no pillars, no
    // credits and no evidence for four months.
    api.get.mockImplementation((url) => {
      if (url.startsWith('/api/portfolio/public/')) return Promise.resolve({ data: DIPLOMA_PAYLOAD })
      return Promise.resolve({ data: { events: [] } })
    })
    renderDiploma('/portfolio/emma-ruiz')
    await expectFullyPopulated()
  })

  it('renders every section on /public/diploma/:userId', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/api/portfolio/diploma/')) return Promise.resolve({ data: DIPLOMA_PAYLOAD })
      return Promise.resolve({ data: { events: [] } })
    })
    renderDiploma('/public/diploma/student-9')
    await expectFullyPopulated()
  })

  it('asks for the slug route\'s learning events by the student id in the payload', async () => {
    // The old code read a top-level `user_id` this endpoint has never returned,
    // so learning events silently never loaded on the slug route -- an empty
    // section, indistinguishable from a student who has recorded none.
    api.get.mockImplementation((url) => {
      if (url.startsWith('/api/portfolio/public/')) return Promise.resolve({ data: DIPLOMA_PAYLOAD })
      return Promise.resolve({
        data: { events: [{ id: 'ev-1', title: 'The circuit that would not close' }] }
      })
    })
    renderDiploma('/portfolio/emma-ruiz')

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        '/api/users/student-9/learning-events/public',
        expect.anything()
      )
    })
    expect(await screen.findByText('The circuit that would not close')).toBeInTheDocument()
  })

  it('shows the FERPA public notice when the student opted in', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/api/portfolio/diploma/')) {
        return Promise.resolve({
          data: { ...DIPLOMA_PAYLOAD, public_consent_info: { opted_in: true, with_parent_approval: true } }
        })
      }
      return Promise.resolve({ data: { events: [] } })
    })
    renderDiploma('/public/diploma/student-9')
    expect(await screen.findByTestId('public-notice')).toHaveTextContent('Emma Ruiz')
  })

  it('shows no notice on a payload with no consent record', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/api/portfolio/diploma/')) return Promise.resolve({ data: DIPLOMA_PAYLOAD })
      return Promise.resolve({ data: { events: [] } })
    })
    renderDiploma('/public/diploma/student-9')
    await screen.findByTestId('sidebar')
    expect(screen.queryByTestId('public-notice')).not.toBeInTheDocument()
  })

  it('says a missing portfolio is missing', async () => {
    api.get.mockRejectedValue({ response: { status: 404 } })
    renderDiploma('/portfolio/nobody')
    expect(await screen.findByText('Diploma not found')).toBeInTheDocument()
  })

  it('says a withheld portfolio is private, not broken', async () => {
    // A 403 on the slug route means the owner has not shared it. Telling the
    // reader "Error loading diploma" sends them to support over a setting.
    api.get.mockRejectedValue({ response: { status: 403 } })
    renderDiploma('/portfolio/emma-ruiz')
    expect(await screen.findByText('This diploma is private')).toBeInTheDocument()
  })
})

describe('DiplomaPage — the FERPA privacy toggle', () => {
  const ME = { id: 'me-1', first_name: 'Sam' }

  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: ME, loginTimestamp: 1 }
    actingAsState = { actingAsDependent: null }
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('asks for consent before making a portfolio public', async () => {
    // Publishing a minor's work is the consequential direction. It goes through
    // an explicit acknowledgement, and the request carries that acknowledgement
    // -- the backend refuses publication on a minor's self-consent
    // (trg_publication_consent_provenance), so a silent PUT here would 500 at
    // best and publish without a record at worst.
    stubOwnerFetches({ visibility: { is_public: false } })
    api.put.mockResolvedValue({ data: { data: { is_public: true } } })

    renderDiploma('/diploma')
    fireEvent.click(await screen.findByTestId('privacy-toggle'))

    const consent = await screen.findByTestId('consent-confirm')
    expect(api.put).not.toHaveBeenCalled()

    fireEvent.click(consent)
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/api/portfolio/user/me-1/privacy',
        { is_public: true, consent_acknowledged: true }
      )
    })
  })

  it('makes a portfolio private immediately, with no second dialog', async () => {
    // Withdrawing is the safe direction. An extra confirmation between a
    // student and un-publishing their own work is a barrier in the wrong place.
    stubOwnerFetches({ visibility: { is_public: true } })
    api.put.mockResolvedValue({ data: { data: { is_public: false } } })

    renderDiploma('/diploma')
    fireEvent.click(await screen.findByTestId('privacy-toggle'))

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/api/portfolio/user/me-1/privacy',
        { is_public: false, consent_acknowledged: false }
      )
    })
    expect(screen.queryByTestId('consent-confirm')).not.toBeInTheDocument()
  })

  it('reads the visibility status for the child when acting as one', async () => {
    actingAsState = { actingAsDependent: { id: 'kid-3', first_name: 'Rory' } }
    stubOwnerFetches()

    renderDiploma('/diploma')

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/portfolio/user/kid-3/visibility-status')
    })
  })
})

describe('DiplomaPage — subject XP', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState = { user: { id: 'me-1', first_name: 'Sam' }, loginTimestamp: 1 }
    actingAsState = { actingAsDependent: null }
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('counts verified XP toward credit and keeps pending XP separate', async () => {
    // A task waiting on a teacher's verification is not credit yet. Folding
    // pending into the credit total tells a family they have a credit they do
    // not have, which is a transcript claim.
    stubOwnerFetches({
      subjectXP: [
        { school_subject: 'science', verified_xp: 600, xp_amount: 900, pending_xp: 300 },
        { school_subject: 'math', xp_amount: 400 }
      ]
    })

    renderDiploma('/diploma')
    const sidebar = await screen.findByTestId('sidebar')

    await waitFor(() => {
      expect(JSON.parse(sidebar.getAttribute('data-subjects')))
        .toEqual({ science: 600, math: 400 })
    })
    expect(JSON.parse(screen.getByTestId('modals').getAttribute('data-pending-xp')))
      .toEqual({ science: 300 })
  })

  it('falls back to xp_amount for rows written before verification existed', async () => {
    stubOwnerFetches({ subjectXP: [{ school_subject: 'science', xp_amount: 750 }] })

    renderDiploma('/diploma')
    const sidebar = await screen.findByTestId('sidebar')

    await waitFor(() => {
      expect(JSON.parse(sidebar.getAttribute('data-subjects'))).toEqual({ science: 750 })
    })
  })

  it('treats a verified zero as zero, not as missing', async () => {
    // `??`, not `||`. A subject verified at 0 must not silently inherit the
    // unverified total.
    stubOwnerFetches({
      subjectXP: [{ school_subject: 'science', verified_xp: 0, xp_amount: 900 }]
    })

    renderDiploma('/diploma')
    const sidebar = await screen.findByTestId('sidebar')

    await waitFor(() => {
      expect(JSON.parse(sidebar.getAttribute('data-subjects'))).toEqual({ science: 0 })
    })
  })
})
