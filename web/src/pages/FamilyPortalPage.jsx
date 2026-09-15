import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import { Link } from 'react-router-dom'
import { AcademicCapIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import BackToSchool from '../components/navigation/BackToSchool'
import ChecklistAssignments from '../components/sis/ChecklistAssignments'
import { useFamilyOrgSelection } from '../hooks/api/useSchoolContext'

/**
 * Family portal (Learning app) — the checklists a school assigns to a guardian.
 *
 * Backed by /api/sis/parent/onboarding (authorized by family relationship). A
 * guardian marks items complete, follows any linked step, attaches a document to
 * items that need one, and signs items that need signing by typing their name
 * (all of it in components/sis/ChecklistAssignments, shared with the paperwork
 * hold page). Distinct from the staff SIS console, which is where admins build
 * the templates and assign them.
 */

// Same wording the staff training page uses, so a parent who is also a teacher
// reads one vocabulary across both portals.
const questProgressLabel = (p) => {
  if (!p?.started) return 'Not started'
  if (p.completed) return 'Complete'
  if (!p.total) return 'In progress'
  return `${p.done} of ${p.total} tasks`
}

const questProgressStyle = (p) => {
  if (!p?.started) return 'bg-gray-100 text-gray-500'
  if (p.completed) return 'bg-green-100 text-green-700'
  return 'bg-amber-100 text-amber-800'
}

const FamilyPortalPage = () => {
  // One shared read of where this person is a guardian (hooks/api/useSchoolContext).
  const { orgs, orgId, setOrgId, loading, isError } = useFamilyOrgSelection()
  const [assignments, setAssignments] = useState([])
  const [quests, setQuests] = useState([])

  useEffect(() => {
    if (isError) toast.error('Could not load your portal')
  }, [isError])

  const load = useCallback(() => {
    if (!orgId) return
    api.get(`/api/sis/parent/onboarding?organization_id=${orgId}`)
      .then((r) => setAssignments(r.data?.assignments || []))
      .catch(() => toast.error('Could not load your checklists'))
    // A school with no family quests set is the normal case, so this failing
    // must not take the checklists down with it.
    api.get(`/api/sis/parent/quests?organization_id=${orgId}`)
      .then((r) => setQuests(r.data?.quests || []))
      .catch(() => setQuests([]))
  }, [orgId])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-8"><p className="text-gray-500">Loading…</p></div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <BackToSchool className="mb-3" />
      <div className="flex items-center justify-between mb-1 gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Your portal</h1>
        {orgs.length > 1 && (
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name || 'School'}</option>)}
          </select>
        )}
      </div>
      <p className="text-gray-500 mb-6">Checklists shared with your family. Mark each step done as you finish it.</p>

      {/* Quests the school set for families — back to school night and the like.
          Yours, on your own account: this is not your child's work. */}
      {quests.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Quests from your school</h2>
          <p className="text-sm text-gray-500 mb-3">
            These are yours to do. Open one to start it, and your progress shows up here.
          </p>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {quests.map((q) => (
              <div key={q.quest_id} className="p-4 flex items-start gap-3">
                {q.progress?.completed
                  ? <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  : <AcademicCapIcon className="w-5 h-5 text-optio-purple shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{q.title}</span>
                    {q.is_required && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple">
                        Required
                      </span>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${questProgressStyle(q.progress)}`}>
                      {questProgressLabel(q.progress)}
                    </span>
                  </div>
                  {q.description && <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{q.description}</p>}
                  <Link to={`/quests/${q.quest_id}`}
                    className="inline-block text-sm text-optio-purple hover:underline mt-1">
                    {q.progress?.started ? 'Continue' : 'Start this quest'}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!assignments.length ? (
        !quests.length && <p className="text-gray-400">Nothing to complete right now.</p>
      ) : (
        <ChecklistAssignments orgId={orgId} assignments={assignments} onChanged={load} />
      )}
    </div>
  )
}

export default FamilyPortalPage
