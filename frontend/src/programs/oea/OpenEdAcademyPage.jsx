/**
 * Hearthwood Academy landing (/hearthwood).
 *
 * The school-specific tab for OEA families. Branches by role:
 *  - Parent: explains the diploma program and lists their students with the
 *    pathway each has chosen (or a prompt to choose one), linking to per-student
 *    pathway selection and the credits dashboard.
 *  - Student: shows a read-only view of their own diploma progress.
 *
 * Web port of frontend-v2/app/(app)/oea/welcome.tsx. Students managed by the
 * parent come from the dependents relationship (managed_by_parent_id), which is
 * the same ownership the OEA backend authorizes.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { getMyDependents } from '../../services/dependentAPI'
import { oeaAPI, parentAPI } from '../../services/api'
import OEACreditsView from './OEACreditsView'

function PageShell({ title, subtitle, children }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 font-poppins">
      <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
      {subtitle && <p className="text-neutral-500 mt-1">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  )
}

function studentLabel(s) {
  return s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student'
}

// The students a parent manages for OEA come from two relationships: managed
// dependents (managed_by_parent_id) and approved parent<->student links
// (org students keep their own login). Normalize both to { id, name } and
// dedupe so each student appears once.
function mergeStudents(dependents, children) {
  const byId = new Map()
  for (const d of dependents || []) {
    byId.set(d.id, { id: d.id, name: studentLabel(d) })
  }
  for (const c of children || []) {
    const id = c.student_id
    if (!id || byId.has(id)) continue
    const name = `${c.student_first_name || ''} ${c.student_last_name || ''}`.trim() || 'Student'
    byId.set(id, { id, name })
  }
  return [...byId.values()]
}

function ParentView() {
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [enrollments, setEnrollments] = useState({})
  const [helpVideoUrl, setHelpVideoUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [depRes, childRes, enrRes] = await Promise.all([
        getMyDependents().catch(() => ({ dependents: [] })),
        parentAPI.getMyChildren().catch(() => ({ data: { children: [] } })),
        oeaAPI.enrollments().catch(() => ({ data: { enrollments: [] } })),
      ])
      setStudents(mergeStudents(depRes?.dependents, childRes?.data?.children))
      const byStudent = {}
      for (const e of enrRes?.data?.enrollments || []) byStudent[e.student_id] = e
      setEnrollments(byStudent)
      setHelpVideoUrl(enrRes?.data?.help_video_url || null)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not load your students.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // First-run guidance: while any student still has no pathway, spell out the
  // steps (Hearthwood feedback — parents arrive unsure what to do first).
  const needsGettingStarted = !loading &&
    (students.length === 0 || students.some((s) => !enrollments[s.id]?.pathway?.name))

  return (
    <PageShell
      title="Welcome to Hearthwood Academy"
      subtitle="Track credits and learning toward a Hearthwood Academy diploma."
    >
      {helpVideoUrl ? (
        <a
          href={helpVideoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-optio-purple/30 bg-[#F3EFF4] p-4 mb-4 hover:border-optio-purple"
        >
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink shrink-0">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span>
            <span className="block font-semibold text-neutral-900">New here? Watch the getting-started video</span>
            <span className="block text-sm text-neutral-600">See how to choose a pathway, enter courses, and add weekly learning logs.</span>
          </span>
        </a>
      ) : (
        /* Placeholder until Hearthwood posts the video (admins set the URL in
           Organization -> Settings). */
        !loading && (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4 mb-4">
            <span className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-200 shrink-0">
              <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </span>
            <span>
              <span className="block font-semibold text-neutral-500">Getting-started video coming soon</span>
              <span className="block text-sm text-neutral-400">Hearthwood Academy will post a short walkthrough of the weekly flow here.</span>
            </span>
          </div>
        )
      )}

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
          <span className="font-semibold text-neutral-900">{needsGettingStarted ? 'Getting started' : 'How it works'}</span>
        </div>
        <p className="text-sm text-neutral-600 mt-2">
          Each student works toward 24 credits on one of three diploma pathways.
        </p>
        {needsGettingStarted ? (
          <ol className="text-sm text-neutral-600 mt-2 space-y-1 list-decimal list-inside">
            <li>Choose a diploma pathway for each student below — you can change it anytime.</li>
            <li>Enter the courses your student is currently working on.</li>
            <li>Add work evidence and learning logs to each course every week.</li>
          </ol>
        ) : (
          <p className="text-sm text-neutral-600 mt-1">
            Open a student's credits to enter courses, add work evidence and learning
            logs, and record grades. You can change their pathway anytime.
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center mt-4">
          <p className="font-semibold text-neutral-900">Add your first student</p>
          <p className="text-sm text-neutral-500 mt-1 mb-4">
            Add a student to your family, then choose their diploma pathway.
          </p>
          <button
            type="button"
            onClick={() => navigate('/parent/dashboard')}
            className="min-h-[44px] px-5 rounded-lg font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink"
          >
            Go to my family
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-neutral-500">{students.length === 1 ? 'YOUR STUDENT' : 'YOUR STUDENTS'}</p>
          {students.map((s) => {
            const enrollment = enrollments[s.id]
            const pathwayName = enrollment?.pathway?.name
            const name = s.name
            return (
              <div key={s.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
                <p className="font-semibold text-neutral-900">{name}</p>
                <p className={`text-sm ${pathwayName ? 'text-neutral-600' : 'text-amber-700'}`}>
                  {pathwayName || `Get started by choosing ${name}'s diploma pathway — you can change it anytime.`}
                </p>
                {pathwayName ? (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/hearthwood/student/${s.id}/credits`, { state: { studentName: name } })}
                      className="flex-1 min-h-[40px] rounded-lg font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink"
                    >
                      Course Tracker
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/hearthwood/student/${s.id}/pathway`, { state: { studentName: name } })}
                      className="flex-1 min-h-[40px] rounded-lg font-semibold text-optio-purple border border-optio-purple hover:bg-[#F3EFF4]"
                    >
                      Change pathway
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate(`/hearthwood/student/${s.id}/pathway`, { state: { studentName: name } })}
                    className="mt-3 w-full min-h-[40px] rounded-lg font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink"
                  >
                    Choose pathway
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}

function StudentView({ user }) {
  return (
    <PageShell
      title="My Hearthwood Academy diploma"
      subtitle="Your progress toward a 24-credit Hearthwood Academy diploma."
    >
      <OEACreditsView studentId={user.id} studentName={user.first_name || user.display_name} readOnly />
    </PageShell>
  )
}

export default function OpenEdAcademyPage() {
  const { user, effectiveRole } = useAuth()

  if (!user) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Students see their own read-only diploma; everyone else (parents, and
  // superadmin for support) gets the management view.
  if (effectiveRole === 'student') {
    return <StudentView user={user} />
  }
  return <ParentView />
}
