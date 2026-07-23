import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../services/api'

/**
 * Family student record — a parent's read-only view of the record their school
 * keeps for one of their students: profile facts, beginning-of-year vs
 * end-of-year assessments, the curriculum materials checklist, and per-class
 * scores. Printable, so families can attach it to scholarship applications.
 */

const PROFILE_LABELS = {
  preferred_name: 'Preferred name',
  grade: 'Grade',
  hobbies: 'Hobbies and interests',
  notes: 'Other notes',
}

const prettyKey = (k) =>
  PROFILE_LABELS[k] || k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

const Card = ({ title, children }) => (
  <section className="bg-white rounded-xl border border-gray-200 p-5 mb-5 break-inside-avoid">
    <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">{title}</h2>
    {children}
  </section>
)

const Check = ({ on, label }) => (
  <span aria-label={`${label}: ${on ? 'yes' : 'no'}`} className={on ? 'text-green-600 font-semibold' : 'text-neutral-300'}>
    {on ? 'Yes' : '—'}
  </span>
)

const FamilyStudentPage = () => {
  const { studentId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/api/sis/parent/students/${studentId}/record`)
      .then((r) => setData(r.data))
      .catch((e) => {
        setError(e?.response?.data?.error || 'Could not load the student record')
        toast.error('Could not load the student record')
      })
  }, [studentId])

  if (error) return <div className="max-w-3xl mx-auto px-4 py-8 text-neutral-500">{error}</div>
  if (!data) return <div className="max-w-3xl mx-auto px-4 py-8 text-neutral-500">Loading…</div>

  const student = data.student || {}
  const profile = data.record?.profile || {}
  const assessments = data.record?.assessments || {}
  const fields = data.assessment_fields || []
  const materials = data.materials || []
  const scores = data.scores || []

  const profileKeys = [
    ...Object.keys(PROFILE_LABELS).filter((k) => profile[k]),
    ...Object.keys(profile).filter((k) => !(k in PROFILE_LABELS) && profile[k]),
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <style>{`@media print { body { background: white } }`}</style>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          {student.avatar_url ? (
            <img src={student.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-lg font-semibold flex-shrink-0">
              {(student.name || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-neutral-900 truncate">{student.name}</h1>
            <p className="text-sm text-neutral-500">
              {[student.grade_level && `Grade ${student.grade_level}`, student.date_of_birth && `Born ${student.date_of_birth}`]
                .filter(Boolean).join(' · ') || 'Student record'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 print:hidden">
          <Link to="/family/goals" className="text-sm text-optio-purple font-medium hover:underline">Set goals</Link>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-medium px-4 py-2"
          >
            Print
          </button>
        </div>
      </div>

      <Card title="Profile">
        {profileKeys.length === 0
          ? <p className="text-sm text-neutral-400">Nothing recorded yet.</p>
          : (
            <dl className="space-y-2">
              {profileKeys.map((k) => (
                <div key={k} className="grid grid-cols-3 gap-3 text-sm">
                  <dt className="text-neutral-500">{prettyKey(k)}</dt>
                  <dd className="col-span-2 text-neutral-800 whitespace-pre-wrap">{String(profile[k])}</dd>
                </div>
              ))}
            </dl>
          )}
      </Card>

      <Card title="Progress">
        {fields.length === 0
          ? <p className="text-sm text-neutral-400">No assessments recorded yet.</p>
          : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-400 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium" />
                  <th className="py-2 pr-3 font-medium">Beginning of year</th>
                  <th className="py-2 font-medium">End of year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fields.map((f) => (
                  <tr key={f.key}>
                    <td className="py-2 pr-3 text-neutral-500 whitespace-nowrap">{f.label}</td>
                    <td className="py-2 pr-3 text-neutral-800">{assessments[f.key]?.boy || '—'}</td>
                    <td className="py-2 text-neutral-800">{assessments[f.key]?.eoy || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      <Card title="Curriculum materials">
        {materials.length === 0
          ? <p className="text-sm text-neutral-400">No materials listed yet.</p>
          : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-400 border-b border-gray-100">
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium text-center">Paid</th>
                  <th className="py-2 pr-3 font-medium text-center">Received</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {materials.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 pr-3 text-neutral-800">{m.item_name}</td>
                    <td className="py-2 pr-3 text-center"><Check on={m.paid} label={`${m.item_name} paid`} /></td>
                    <td className="py-2 pr-3 text-center"><Check on={m.received} label={`${m.item_name} received`} /></td>
                    <td className="py-2 text-neutral-500">{m.notes || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Card>

      <Card title="Scores">
        {scores.length === 0
          ? <p className="text-sm text-neutral-400">No scores recorded yet.</p>
          : scores.map((c) => (
            <div key={c.class_id || c.class_name} className="mb-5 last:mb-0 break-inside-avoid">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <h3 className="text-sm font-semibold text-neutral-800">{c.class_name}</h3>
                {c.average != null && (
                  <span className="text-sm font-semibold text-optio-purple">Average: {c.average}%</span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-400 border-b border-gray-100">
                    <th className="py-1.5 pr-3 font-medium">Assignment</th>
                    <th className="py-1.5 pr-3 font-medium">Completed</th>
                    <th className="py-1.5 font-medium text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(c.assignments || []).map((a) => (
                    <tr key={a.id}>
                      <td className="py-1.5 pr-3 text-neutral-800">{a.name}</td>
                      <td className="py-1.5 pr-3 text-neutral-500">{a.date_completed || '—'}</td>
                      <td className="py-1.5 text-right text-neutral-800">
                        {a.score == null ? '—' : a.max_score != null ? `${a.score}/${a.max_score}` : a.score}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </Card>
    </div>
  )
}

export default FamilyStudentPage
