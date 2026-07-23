import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import ModalOverlay from '../../components/ui/ModalOverlay'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'

/**
 * Goals — the staff side of goal/direction setting (goals-mode schools). Parents
 * submit a long-term direction + per-subject year goals for each child; staff
 * review them in a family meeting and mark them reviewed here.
 */

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const STATUS_META = {
  submitted: { label: 'Submitted', pill: 'bg-optio-purple/10 text-optio-purple' },
  draft: { label: 'Draft', pill: 'bg-gray-100 text-neutral-600' },
  reviewed: { label: 'Reviewed', pill: 'bg-green-100 text-green-700' },
}
const STATUS_ORDER = ['submitted', 'draft', 'reviewed']

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '')

const GoalDetail = ({ goal, orgId, onClose, onReviewed }) => {
  const [notes, setNotes] = useState(goal.review_notes || '')
  const [saving, setSaving] = useState(false)

  const markReviewed = async () => {
    setSaving(true)
    try {
      await api.post(`/api/sis/goals/${goal.id}/review`, { review_notes: notes, organization_id: orgId })
      toast.success('Marked reviewed')
      onReviewed()
    } catch {
      toast.error('Could not mark reviewed')
    } finally {
      setSaving(false)
    }
  }

  const meta = STATUS_META[goal.status] || STATUS_META.draft
  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">{goal.student_name}</h2>
            <div className="text-sm text-neutral-500">
              {goal.school_year}
              {goal.parent_name ? ` · Set by ${goal.parent_name}` : ''}
              {goal.submitted_at ? ` · Submitted ${fmtDate(goal.submitted_at)}` : ''}
            </div>
          </div>
          <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 ${meta.pill}`}>{meta.label}</span>
        </div>

        <div className="mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">Direction</div>
          <div className="text-sm text-neutral-800">{goal.direction || <span className="text-neutral-400">Not set</span>}</div>
          {goal.direction_notes && (
            <div className="text-sm text-neutral-500 mt-1 whitespace-pre-wrap">{goal.direction_notes}</div>
          )}
        </div>

        {(goal.subjects || []).map((s) => (
          <div key={s.subject} className="border border-gray-200 rounded-lg p-3 mb-2">
            <div className="text-sm font-semibold text-neutral-900 mb-1">{s.subject}</div>
            <div className="text-sm text-neutral-700">
              <span className="text-neutral-400">This year: </span>
              {s.year_goal || <span className="text-neutral-400">Not set</span>}
            </div>
            <div className="text-sm text-neutral-700">
              <span className="text-neutral-400">Long term: </span>
              {s.long_term || <span className="text-neutral-400">Not set</span>}
            </div>
          </div>
        ))}

        {goal.status === 'reviewed' ? (
          <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3">
            <div className="text-sm font-semibold text-green-800">Reviewed {fmtDate(goal.reviewed_at)}</div>
            {goal.review_notes && <div className="text-sm text-green-800 mt-1 whitespace-pre-wrap">{goal.review_notes}</div>}
          </div>
        ) : (
          <div className="mt-4">
            <label className="block text-sm font-medium text-neutral-700 mb-1">Review notes</label>
            <textarea
              className={`${field} w-full`}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes from the goal review meeting"
            />
          </div>
        )}

        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {goal.status !== 'reviewed' && (
            <Button onClick={markReviewed} loading={saving}>Mark reviewed</Button>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}

const GoalsReviewPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [goals, setGoals] = useState(null)
  const [config, setConfig] = useState(null)
  const [year, setYear] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const load = () => {
    if (!orgId) return
    const path = `/api/sis/goals${year ? `?school_year=${encodeURIComponent(year)}` : ''}`
    api.get(withOrg(path, orgId))
      .then((r) => {
        setGoals(r.data?.goals || [])
        setConfig(r.data?.config || null)
      })
      .catch(() => { toast.error('Could not load goals'); setGoals([]) })
  }

  useEffect(() => { setGoals(null); load() }, [orgId, year]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = goals?.find((g) => g.id === selectedId)
  const grouped = STATUS_ORDER
    .map((status) => ({ status, items: (goals || []).filter((g) => g.status === status) }))
    .filter((group) => group.items.length > 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Goals</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-3">
        <label className="text-sm text-neutral-600" htmlFor="goals-year">School year</label>
        <select
          id="goals-year"
          className={field}
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="">All years</option>
          {(config?.school_years || []).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {goals === null && <p className="text-neutral-500">Loading…</p>}
      {goals?.length === 0 && (
        <p className="text-neutral-500">No family goals yet. Parents set goals from their Goal Setting page after registering.</p>
      )}

      {grouped.map(({ status, items }) => {
        const meta = STATUS_META[status]
        return (
          <div key={status} className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">
              {meta.label} ({items.length})
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {items.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedId(g.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-neutral-900 truncate">{g.student_name}</span>
                    <span className="block text-xs text-neutral-500 truncate">
                      {g.direction || 'No direction set'}
                      {g.school_year ? ` · ${g.school_year}` : ''}
                      {g.submitted_at ? ` · Submitted ${fmtDate(g.submitted_at)}` : ''}
                    </span>
                  </span>
                  <span className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 ${meta.pill}`}>{meta.label}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}

      {selected && (
        <GoalDetail
          goal={selected}
          orgId={orgId}
          onClose={() => setSelectedId(null)}
          onReviewed={() => { setSelectedId(null); load() }}
        />
      )}
    </div>
  )
}

export default GoalsReviewPage
