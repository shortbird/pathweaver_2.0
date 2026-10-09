import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useFamilyScope, worksThroughFamily } from '../contexts/FamilyScopeContext'
import { useStudentScope } from '../hooks/useStudentScope'
import { useFamilyOrgSelection, useSchoolContext } from '../hooks/api/useSchoolContext'
import { InformationCircleIcon } from '@heroicons/react/24/outline'
import { PageLoader } from '../components/ui/Spinner'
import { Modal } from '../components/ui/Modal'
import SubjectCard from '../components/coursesAndCredits/SubjectCard'
import AddCourseModal from '../components/coursesAndCredits/AddCourseModal'
import CheckInModal from '../components/coursesAndCredits/CheckInModal'
import MoveCreditModal from '../components/coursesAndCredits/MoveCreditModal'
import { XP_PER_CREDIT_LINE, creditsToXp, xpLabel } from '../components/coursesAndCredits/xpLabels'
import CreditProgressBar from '../components/coursesAndCredits/CreditProgressBar'
import SubjectOverview from '../components/coursesAndCredits/SubjectOverview'
import FamilyPriorLearningPage from './FamilyPriorLearningPage'
import {
  TOTAL_CREDITS_REQUIRED,
  formatCredits,
  getCreditStanding,
} from '../utils/creditRequirements'

// The two ways a family earns credit, side by side (Tanner, 2026-09-28):
// their own curriculum, and Optio quests. Families who teach from their own
// materials need the first; quests are what make Optio different, so they are
// offered as an equal, not an afterthought.
const WAYS = [
  {
    key: 'own',
    title: 'Your own curriculum',
    body: `Add it to a subject and do the work your way. Send a check-in with photos of the work each semester. A semester is ${xpLabel(creditsToXp(0.5))} (half a credit), a full year is ${xpLabel(creditsToXp(1))} (one credit).`,
  },
  {
    key: 'quests',
    title: 'Optio quests',
    body: 'Projects that cross subjects. Each finished task earns XP in every subject it touches, on top of any course.',
  },
]

// Prior Learning, folded in from its own school tab (2026-09-28). Offered only
// where the school takes prior learning, to a guardian or (since 2026-10-09)
// to a student sending their own; the endpoint answers to family relationship
// or to the student's own membership.
const PRIOR_WAY = {
  key: 'prior',
  title: 'Learning from before Optio',
  body: 'Send transcripts, report cards or samples of work from another school. Once reviewed, the credit shows up in each subject below as transfer credit.',
}

/**
 * Courses and Credits: every diploma subject, the courses filling it, and the
 * one place a family adds a course or sends a semester check-in.
 *
 * Built for families who teach from their own curriculum (Hearthwood Academy
 * families joining Optio Academy, 2026-09). Two ways to earn credit are offered:
 * their own curriculum and Optio quests. Quest credit, transfer credit and any
 * Optio classes a student already has show up in the same subject. The backend sends XP per
 * subject; the credit arithmetic, including surplus overflowing into Electives,
 * is the shared getCreditStanding, so these numbers match the portfolio's.
 *
 * Family scope: a parent sees and acts for the selected child. It is a tab of
 * the school page (pages/school/SchoolShell), whose student picker switches
 * the child; a parent who arrives with no child picked gets their first
 * student at the school, the way the Schedule tab does, instead of being
 * bounced to /family.
 */
const CoursesAndCreditsPage = () => {
  const { user, effectiveRole } = useAuth()
  const { enterScope } = useFamilyScope()
  const { params: scopeParams, studentId, scopeId, studentName } = useStudentScope()
  const { students, org, loading: studentsLoading } = useFamilyOrgSelection()
  const isGuardian = worksThroughFamily(user)
  // A student sends their own prior learning (2026-10-09), from their own
  // school's membership rather than a guardian's.
  const isSelfStudent = !isGuardian && effectiveRole === 'student'
  const { orgs: memberOrgs } = useSchoolContext({ enabled: isSelfStudent })
  const offersPriorLearning = isGuardian
    ? Boolean(org?.prior_learning_enabled)
    : isSelfStudent && (memberOrgs || []).some((o) => o.prior_learning_enabled)
  const priorStudentId = isGuardian ? studentId : user?.id
  const ways = offersPriorLearning ? [...WAYS, PRIOR_WAY] : WAYS
  // A parent's own account has no courses; the page is always about a child.
  const waitingForChild = isGuardian && !studentId
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [addingTo, setAddingTo] = useState(null)
  const [checkInTarget, setCheckInTarget] = useState(null)
  const [moveTarget, setMoveTarget] = useState(null)
  const [showWays, setShowWays] = useState(false)

  useEffect(() => {
    if (waitingForChild && students.length) enterScope(students[0].student_id)
  }, [waitingForChild, students, enterScope])

  const load = useCallback(async () => {
    if (waitingForChild) return
    try {
      const res = await api.get('/api/courses-and-credits', { params: scopeParams })
      setPlan(res.data?.data || null)
      setLoadError(false)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [scopeId, waitingForChild])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // /family/prior-learning (emailed links, the mobile School door) lands here
  // with #prior-learning; the section only exists once the plan has loaded,
  // so the browser's own jump to the anchor has already missed it.
  const { hash } = useLocation()
  const planLoaded = Boolean(plan)
  useEffect(() => {
    if (hash === '#prior-learning' && planLoaded) {
      document.getElementById('prior-learning')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }
  }, [hash, planLoaded])

  const standing = useMemo(() => {
    const xp = {}
    for (const s of plan?.subjects || []) xp[s.key] = s.earned_xp
    return getCreditStanding(xp)
  }, [plan])
  const standingBySubject = useMemo(
    () => Object.fromEntries(standing.progress.map((p) => [p.subject, p])),
    [standing]
  )
  const pendingXp = useMemo(
    () => (plan?.subjects || []).reduce((sum, s) => sum + (s.pending_xp || 0), 0),
    [plan]
  )

  // Always the student's name: the child a parent is working for, or the
  // student's own. "Your" only if we have no name at all.
  const name = studentName || user?.first_name || null
  const whose = name ? `${name}'s` : 'your'
  const heading = name ? `${name}'s courses and credits` : 'Your courses and credits'
  const percent = Math.min(100, (standing.totalApplied / TOTAL_CREDITS_REQUIRED) * 100)

  if (waitingForChild && !studentsLoading && !students.length) {
    return (
      <div className="max-w-3xl mx-auto card text-center">
        <p className="text-sm text-gray-700">
          None of your children are enrolled at the school yet. Once they are, their courses and credits
          show up here.
        </p>
      </div>
    )
  }
  if (loading || waitingForChild) return <PageLoader />

  return (
    <div className="max-w-3xl mx-auto py-8">
      {/* The ways to earn XP live behind the info icon, not in a box on the
          page (2026-09-28): families read them once, then want the subjects. */}
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
        <button
          type="button"
          onClick={() => setShowWays(true)}
          className="p-1 text-gray-400 hover:text-optio-purple rounded-full transition-colors"
          aria-label="How to earn XP"
          title="How to earn XP"
        >
          <InformationCircleIcon className="w-6 h-6" />
        </button>
      </div>
      <p className="text-sm text-gray-500 mt-1">
        Every subject on the diploma, and the courses that count toward it.
      </p>

      {loadError || !plan ? (
        <div className="card mt-6 text-center">
          <p className="text-sm text-gray-700">This page did not load.</p>
          <button type="button" onClick={() => { setLoading(true); load() }} className="btn-quiet mt-4">
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="card mt-6">
            {/* The diploma counts credits, so the headline does; the XP they
                stand for sits under it, so the two become one idea. */}
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-gray-700">
                <span className="text-2xl font-bold text-optio-purple">{formatCredits(standing.totalApplied)}</span>{' '}
                of {formatCredits(TOTAL_CREDITS_REQUIRED)} credits toward {whose} diploma
              </p>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {xpLabel(creditsToXp(standing.totalApplied))} of {xpLabel(creditsToXp(TOTAL_CREDITS_REQUIRED))}. {XP_PER_CREDIT_LINE}
            </p>
            {/* XP waiting on review is the yellow part of the bar. */}
            <div className="mt-3">
              <CreditProgressBar
                earnedPercent={percent}
                pendingXp={pendingXp}
                requiredXp={creditsToXp(TOTAL_CREDITS_REQUIRED)}
                height="h-3"
              />
            </div>
            {/* The key for every bar on the page, the subjects' included. */}
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600" aria-label="Progress bar key">
              <li className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-gradient-primary flex-shrink-0" aria-hidden="true" />
                Recorded on Optio transcript
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-yellow-400 flex-shrink-0" aria-hidden="true" />
                Pending Optio approval
              </li>
            </ul>
          </div>

          <SubjectOverview subjects={plan.subjects} standingBySubject={standingBySubject} />

          <div className="mt-6 space-y-4">
            {plan.subjects.map((subject) => (
              <SubjectCard
                key={subject.key}
                subject={subject}
                standing={standingBySubject[subject.key]}
                pendingXp={subject.pending_xp || 0}
                onAddCourse={setAddingTo}
                onOpenCheckIn={(course, checkIn) => setCheckInTarget({ course, checkIn })}
                onMoveCredit={setMoveTarget}
                moveRequests={plan.move_requests || []}
                studentId={studentId}
                onMoveChanged={load}
              />
            ))}
          </div>

          {offersPriorLearning && priorStudentId && (
            <section id="prior-learning" className="card mt-6 scroll-mt-24">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Learning from before Optio</h2>
              {/* Accepted records come back as transfer credit in the
                  subjects above, so a send refreshes the page's numbers. */}
              <FamilyPriorLearningPage studentId={priorStudentId} onChange={load} />
            </section>
          )}
        </>
      )}

      <Modal
        isOpen={showWays}
        onClose={() => setShowWays(false)}
        title={`${ways.length === 3 ? 'Three' : 'Two'} ways to earn XP`}
        size="md"
      >
        <p className="text-sm text-gray-600">Use any of them, whatever suits your family.</p>
        <ul className="mt-4 space-y-4">
          {ways.map((w) => (
            <li key={w.key}>
              <span className="block text-sm font-semibold text-gray-900">{w.title}</span>
              <span className="block text-sm text-gray-600 mt-0.5">{w.body}</span>
              {w.key === 'quests' && (
                <Link
                  to="/quests"
                  onClick={() => setShowWays(false)}
                  className="inline-block mt-1 text-sm font-medium text-optio-purple hover:underline"
                >
                  Browse quests
                </Link>
              )}
              {w.key === 'prior' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowWays(false)
                    document.getElementById('prior-learning')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
                  }}
                  className="inline-block mt-1 text-sm font-medium text-optio-purple hover:underline"
                >
                  Send records
                </button>
              )}
            </li>
          ))}
        </ul>
      </Modal>
      <AddCourseModal
        isOpen={!!addingTo}
        onClose={() => setAddingTo(null)}
        onCreated={load}
        subject={addingTo}
        courseLengths={plan?.course_lengths || []}
        studentId={studentId}
      />
      <MoveCreditModal
        key={moveTarget ? `${moveTarget.questId}-${moveTarget.from.key}` : 'none'}
        isOpen={!!moveTarget}
        onClose={() => setMoveTarget(null)}
        onRequested={load}
        target={moveTarget}
        subjects={(plan?.subjects || []).map((s) => ({ key: s.key, name: s.name }))}
        studentId={studentId}
      />
      <CheckInModal
        isOpen={!!checkInTarget}
        onClose={() => setCheckInTarget(null)}
        onSent={load}
        course={checkInTarget?.course}
        checkIn={checkInTarget?.checkIn}
        studentId={studentId}
        studentName={studentName}
      />
    </div>
  )
}

export default CoursesAndCreditsPage
