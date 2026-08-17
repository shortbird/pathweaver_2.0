import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AcademicCapIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClipboardDocumentCheckIcon,
  EnvelopeOpenIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { switchSurfaceInApp } from '../../utils/appSurface'
import api from '../../services/api'
import { Spinner } from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import MyEnrolledQuests from '../../components/home/MyEnrolledQuests'

/**
 * Teacher Home — a teacher's landing on the learning app (rendered by RoleHome
 * at /dashboard). SIS staff normally front-door the console via /sis-launch,
 * but they reach this page whenever they switch back to the learning app, so it
 * has to serve both models.
 *
 * TWO CLASS MODELS, ONE PAGE. Optio's advisor/student relationship (quest
 * invitations, the LMS class pages under /org-classes) and the SIS's class
 * model overlap. The rule: an org with sis_enabled defaults to its SIS
 * features — class cards hop to the console — and the LMS-only advisor
 * features are kept for programs that don't run the SIS.
 *
 * A lightweight triage page ("who needs me today"), deliberately NOT a heavy
 * dashboard: greeting -> waiting-on-you strip -> my classes. No door tiles —
 * every surface they linked to (Messages, quest invitations) is already one
 * click away in the sidebar, so the tiles were a second front door to the same
 * pages. Every data source degrades silently on error — a broken feed hides
 * itself rather than blocking the page.
 */

const QUEUE_PREVIEW_COUNT = 3

function useTeacherHomeData(userId, sisEnabled) {
  const common = {
    enabled: !!userId,
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  }

  // Same endpoint TeacherVerificationPage reads.
  const verifications = useQuery({
    queryKey: ['teacher-home', 'pending-verifications', userId],
    queryFn: async () => {
      const response = await api.get('/api/teacher/pending-verifications')
      return response.data?.tasks || []
    },
    ...common,
  })

  // Pending quest invitations across the advisor's organization. An LMS-only
  // feed: SIS orgs assign work through the console, so it isn't even fetched
  // for them.
  const invitations = useQuery({
    queryKey: ['teacher-home', 'pending-invitations', userId],
    queryFn: async () => {
      const response = await api.get('/api/advisor/quest-invitations?status=pending')
      return response.data?.invitations || []
    },
    ...common,
    enabled: !!userId && !sisEnabled,
  })

  // Same endpoint AdvisorClassesPage's ClassList reads (advisor view).
  const classes = useQuery({
    queryKey: ['teacher-home', 'advisor-classes', userId],
    queryFn: async () => {
      const response = await api.get('/api/advisor/classes?status=active')
      return response.data?.classes || []
    },
    ...common,
  })

  return { verifications, invitations, classes }
}

/** "Waiting on you" — the triage strip. Failed sources drop out silently. */
function WaitingOnYou({ verifications, invitations, showInvitations }) {
  const invitationsOut = !showInvitations || invitations.isError
  const bothFailed = verifications.isError && invitationsOut

  if (bothFailed) return null

  const loading =
    (verifications.isLoading && !verifications.isError) ||
    (!invitationsOut && invitations.isLoading)

  const pendingTasks = verifications.data || []
  const pendingInvitations = invitations.data || []
  const allClear =
    !loading &&
    (verifications.isError || pendingTasks.length === 0) &&
    (invitationsOut || pendingInvitations.length === 0)

  return (
    <section aria-labelledby="waiting-on-you-heading" className="mt-8">
      <h2 id="waiting-on-you-heading" className="text-sm font-semibold text-gray-900">
        Waiting on you
      </h2>

      <div className="mt-2 bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        {loading && (
          <div className="flex items-center gap-3 p-4" role="status" aria-label="Loading">
            <Spinner size="sm" />
            <span className="text-sm text-gray-500">Checking your queues…</span>
          </div>
        )}

        {!loading && allClear && (
          <div className="flex items-center gap-3 p-4">
            <CheckCircleIcon aria-hidden="true" className="w-5 h-5 text-green-600 flex-shrink-0" />
            <span className="text-sm text-gray-600">Nothing waiting on you right now.</span>
          </div>
        )}

        {!loading && !verifications.isError && pendingTasks.length > 0 && (
          <div className="p-4">
            <Link
              to="/advisor/verification"
              className="group flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0">
                  <ClipboardDocumentCheckIcon className="w-5 h-5 text-optio-purple" />
                </span>
                <span className="text-sm font-semibold text-gray-900 group-hover:text-optio-purple">
                  {pendingTasks.length} submission{pendingTasks.length !== 1 ? 's' : ''} waiting for review
                </span>
              </span>
              <ChevronRightIcon className="w-4 h-4 text-gray-400 group-hover:text-optio-purple flex-shrink-0" />
            </Link>

            <ul className="mt-3 space-y-1.5">
              {pendingTasks.slice(0, QUEUE_PREVIEW_COUNT).map((task) => (
                <li key={task.completion_id || task.task_id}>
                  <Link
                    to="/advisor/verification"
                    className="block border border-gray-100 bg-gray-50/60 rounded-lg px-3 py-2 hover:border-optio-purple/60 transition-all"
                  >
                    <span className="block text-sm font-medium text-gray-900 truncate">
                      {task.task_title}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {task.student_name}
                      {task.quest_title ? ` · ${task.quest_title}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {pendingTasks.length > QUEUE_PREVIEW_COUNT && (
              <Link
                to="/advisor/verification"
                className="inline-block mt-2 text-sm font-medium text-optio-purple hover:underline"
              >
                View all {pendingTasks.length}
              </Link>
            )}
          </div>
        )}

        {!loading && !invitationsOut && pendingInvitations.length > 0 && (
          <Link
            to="/advisor/invitations"
            className="group flex items-center justify-between gap-3 p-4"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0">
                <EnvelopeOpenIcon className="w-5 h-5 text-optio-purple" />
              </span>
              <span className="text-sm font-semibold text-gray-900 group-hover:text-optio-purple">
                {pendingInvitations.length} pending quest invitation{pendingInvitations.length !== 1 ? 's' : ''}
              </span>
            </span>
            <ChevronRightIcon className="w-4 h-4 text-gray-400 group-hover:text-optio-purple flex-shrink-0" />
          </Link>
        )}
      </div>
    </section>
  )
}

const CARD_CLASS =
  'group flex items-center gap-3 w-full text-left bg-white border border-gray-200 ' +
  'rounded-xl px-3.5 py-3 hover:border-optio-purple/60 hover:shadow-sm transition-all'

/**
 * A class card's destination depends on the org's surface.
 *
 * SIS-org teachers do their class work in the console (roster, attendance,
 * curriculum, messages), so their cards hop surfaces to /my-classes/:id rather
 * than landing on the learning app's thinner /org-classes/:id page. The hop
 * goes through switchSurfaceInApp so a same-origin switch stays client-side and
 * the session is never re-initialized. Non-SIS advisors keep the plain link.
 */
function ClassCard({ children, sisEnabled, sisPath, learningPath }) {
  if (sisEnabled) {
    return (
      <button
        type="button"
        onClick={() => switchSurfaceInApp('sis', sisPath)}
        className={CARD_CLASS}
      >
        {children}
      </button>
    )
  }
  return <Link to={learningPath} className={CARD_CLASS}>{children}</Link>
}

/** The advisor's working set: compact link cards into each class. */
function MyClasses({ classes, sisEnabled }) {
  return (
    <section aria-labelledby="my-classes-heading" className="mt-8">
      <div className="flex items-center justify-between">
        <h2 id="my-classes-heading" className="text-sm font-semibold text-gray-900">
          My classes
        </h2>
        {sisEnabled ? (
          <button
            type="button"
            onClick={() => switchSurfaceInApp('sis', '/my-classes')}
            className="text-sm font-medium text-optio-purple hover:underline"
          >
            View all
          </button>
        ) : (
          <Link to="/org-classes" className="text-sm font-medium text-optio-purple hover:underline">
            View all
          </Link>
        )}
      </div>

      <div className="mt-2">
        {classes.isLoading && !classes.isError ? (
          <div className="flex justify-center py-8" role="status" aria-label="Loading classes">
            <Spinner size="md" />
          </div>
        ) : classes.isError ? (
          <p className="text-sm text-gray-400 py-2">Couldn’t load your classes right now.</p>
        ) : (classes.data || []).length === 0 ? (
          <EmptyState
            icon={AcademicCapIcon}
            title="No classes yet"
            hint="Classes you're assigned to as an advisor will show up here."
          />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {classes.data.map((cls) => (
              <li key={cls.id}>
                <ClassCard
                  sisEnabled={sisEnabled}
                  sisPath={`/my-classes/${cls.id}`}
                  learningPath={`/org-classes/${cls.id}`}
                >
                  <span className="w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0 group-hover:bg-gradient-primary transition-colors">
                    <AcademicCapIcon className="w-5 h-5 text-optio-purple group-hover:text-white transition-colors" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 group-hover:text-optio-purple truncate">
                      {cls.name}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {cls.student_count ?? 0} student{(cls.student_count ?? 0) !== 1 ? 's' : ''}
                      {' · '}
                      {cls.quest_count ?? 0} quest{(cls.quest_count ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </span>
                </ClassCard>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function TeacherHome() {
  const { user } = useAuth()
  const firstName = user?.first_name || 'there'
  // Same flag getPostLoginPath reads to front-door SIS staff into the console.
  const sisEnabled = Boolean(user?.organization?.feature_flags?.sis_enabled)
  const { verifications, invitations, classes } = useTeacherHomeData(user?.id, sisEnabled)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Welcome back, {firstName}</h1>
      <p className="text-sm text-gray-500 mt-1">Here's who needs you today.</p>

      <WaitingOnYou
        verifications={verifications}
        invitations={invitations}
        showInvitations={!sisEnabled}
      />
      <MyClasses classes={classes} sisEnabled={sisEnabled} />
      {/* Training the school set for its staff lands on this account; a teacher
          has no student dashboard to meet it on. */}
      <MyEnrolledQuests className="mt-8" />
    </div>
  )
}
