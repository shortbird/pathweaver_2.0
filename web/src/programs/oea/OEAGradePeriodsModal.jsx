/**
 * OEAGradePeriodsModal — enter quarter / semester / annual grades + summaries for
 * one OEA course.
 *
 * Quarter entries are progress-only (they feed the quarterly report card). A
 * semester or annual grade is the transcript grade and is gated server-side on the
 * course's quarterly upload minimums — a 422 surfaces here as a clear message
 * explaining what's missing. Saving a semester/annual grade marks the course
 * complete (handled by the backend); the caller reloads on close.
 */
import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { oeaAPI } from '../../services/api'
import ModalOverlay from '../../components/ui/ModalOverlay'

const GRADES = ['A', 'B', 'C', 'D', 'F']
const TERMS = [
  { type: 'quarter', index: 1, label: 'Q1' },
  { type: 'quarter', index: 2, label: 'Q2' },
  { type: 'quarter', index: 3, label: 'Q3' },
  { type: 'quarter', index: 4, label: 'Q4' },
  { type: 'semester', index: 1, label: 'Semester 1' },
  { type: 'semester', index: 2, label: 'Semester 2' },
  { type: 'annual', index: 1, label: 'Annual (final)' },
]

function termKey(t) { return `${t.type}:${t.index}` }

export default function OEAGradePeriodsModal({ credit, onClose, onSaved }) {
  const [periods, setPeriods] = useState([])
  const [sel, setSel] = useState(TERMS[0])
  const [grade, setGrade] = useState(null)
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    oeaAPI.creditPeriods(credit.id)
      .then(({ data }) => { if (active) setPeriods(data?.periods || []) })
      .catch(() => {})
    return () => { active = false }
  }, [credit.id])

  // When the selected term changes, prefill from any existing row.
  useEffect(() => {
    const row = periods.find((p) => p.term_type === sel.type && p.term_index === sel.index)
    setGrade(row?.grade ?? null)
    setSummary(row?.summary ?? '')
  }, [sel, periods])

  const isTranscriptGrade = sel.type !== 'quarter'

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await oeaAPI.saveCreditPeriod(credit.id, {
        term_type: sel.type,
        term_index: sel.index,
        grade: grade || null,
        summary: summary.trim() || null,
      })
      toast.success('Saved')
      const { data } = await oeaAPI.creditPeriods(credit.id)
      setPeriods(data?.periods || [])
      onSaved && onSaved()
    } catch (err) {
      // 422 = quarterly uploads missing for a semester/annual grade.
      toast.error(err.response?.data?.error || 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md">
        <h3 className="font-semibold text-neutral-900">Grades by term — {credit.course_name}</h3>

        <label className="block text-sm font-medium text-neutral-700 mt-4 mb-1">Term</label>
        <select
          value={termKey(sel)}
          onChange={(e) => {
            const [type, index] = e.target.value.split(':')
            setSel({ type, index: Number(index) })
          }}
          className="w-full border border-neutral-300 rounded-lg p-2.5 text-sm"
          aria-label="Term"
        >
          {TERMS.map((t) => (
            <option key={termKey(t)} value={termKey(t)}>{t.label}</option>
          ))}
        </select>

        <p className="text-xs text-neutral-500 mt-2">
          {isTranscriptGrade
            ? 'Semester and annual grades appear on the transcript. The annual grade is final; a semester grade overrides the quarter grades (they are not averaged). Requires the quarterly uploads to be complete.'
            : 'Quarter grades and summaries appear on the progress report. They are not averaged into the transcript.'}
        </p>

        <label className="block text-sm font-medium text-neutral-700 mt-4 mb-1">Grade</label>
        <div className="flex gap-2">
          {GRADES.map((g) => (
            <button key={g} type="button" onClick={() => setGrade(g)}
              className={`flex-1 py-2 rounded-lg border text-sm ${
                grade === g ? 'bg-optio-purple border-optio-purple text-white font-semibold'
                  : 'border-neutral-200 text-neutral-700'
              }`}>
              {g}
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium text-neutral-700 mt-4 mb-1">
          Summary {isTranscriptGrade ? '(optional)' : '(quarterly summary)'}
        </label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          placeholder="Brief summary of progress this term"
          className="w-full border border-neutral-300 rounded-lg p-2.5 text-sm"
        />

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} disabled={saving}
            className="min-h-[40px] px-4 rounded-lg border border-neutral-300 text-neutral-700 text-sm">
            Close
          </button>
          <button type="button" onClick={save} disabled={saving}
            className="min-h-[40px] px-4 rounded-lg text-white text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-60">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
