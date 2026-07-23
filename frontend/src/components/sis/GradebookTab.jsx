import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { PrinterIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import ModalOverlay from '../ui/ModalOverlay'

/**
 * GradebookTab — per-class assignment/score tracking (gradebook-lite).
 *
 * Replaces the microschool Google-Sheets gradebook: one accordion per student
 * (header = name + running-average chip), a table of assignment rows with
 * inline editing (click a cell, save on blur/Enter), add/delete rows, a
 * "Sequences" template manager (with a CLE-style workbook generator + apply
 * to students), and a clean per-student print view.
 *
 * Scores are SIS record-keeping only — they never touch the XP/quest model.
 */

const DEFAULT_STEPS = 'Quiz 1, Quiz 2, Corrections, Test'

const fmtAvg = (avg) => (avg == null ? '—' : `${avg}%`)

const fmtScore = (row) => {
  if (row.score == null) return ''
  const score = Number(row.score)
  return row.max_score != null ? `${score}/${Number(row.max_score)}` : `${score}`
}

/** Parse "85/100" → {score, max_score}; "85" → {score, max_score: null}; "" → nulls. */
const parseScore = (text) => {
  const t = (text || '').trim()
  if (!t) return { score: null, max_score: null }
  const [s, m] = t.split('/')
  const score = parseFloat(s)
  if (Number.isNaN(score)) return null
  if (m === undefined || m.trim() === '') return { score, max_score: null }
  const max = parseFloat(m)
  if (Number.isNaN(max)) return null
  return { score, max_score: max }
}

/** A table cell that turns into an input on click and saves on blur/Enter. */
const EditableCell = ({ value, onSave, type = 'text', placeholder = '', className = '' }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const start = () => { setDraft(value ?? ''); setEditing(true) }
  const commit = () => {
    setEditing(false)
    if ((draft ?? '') !== (value ?? '')) onSave(draft)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.target.blur()
          if (e.key === 'Escape') setEditing(false)
        }}
        className={`w-full px-1.5 py-1 border border-optio-purple rounded text-sm ${className}`}
      />
    )
  }
  return (
    <button type="button" onClick={start}
      className={`w-full text-left px-1.5 py-1 rounded text-sm hover:bg-gray-50 min-h-[28px] ${value ? 'text-neutral-800' : 'text-neutral-400'} ${className}`}>
      {value || placeholder}
    </button>
  )
}

const printStudent = (className, student) => {
  const rows = (student.assignments || []).map((a) => `
    <tr>
      <td>${a.name || ''}</td>
      <td>${a.date_scheduled || ''}</td>
      <td>${a.date_completed || ''}</td>
      <td>${fmtScore(a)}</td>
      <td>${a.notes || ''}</td>
    </tr>`).join('')
  const html = `<!doctype html><html><head><title>${student.name} — Gradebook</title>
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #171717; }
      h1 { font-size: 18px; margin: 0 0 2px; }
      p { margin: 0 0 16px; color: #525252; font-size: 13px; }
      table { border-collapse: collapse; width: 100%; font-size: 12px; }
      th, td { border: 1px solid #d4d4d4; padding: 5px 8px; text-align: left; }
      th { background: #f5f5f5; }
    </style></head><body>
    <h1>${student.name}</h1>
    <p>${className || 'Class'} · Current average: ${fmtAvg(student.average)}</p>
    <table>
      <thead><tr><th>Assignment</th><th>Scheduled</th><th>Completed</th><th>Score</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>`
  const win = window.open('', '_blank')
  if (!win) { toast.error('Allow pop-ups to print'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
}

/** Sequences (assignment templates) modal: manage, generate, apply. */
const SequencesModal = ({ classId, orgId, students, onClose, onApplied }) => {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  // Generator state
  const [tplName, setTplName] = useState('')
  const [baseName, setBaseName] = useState('Workbook')
  const [fromNum, setFromNum] = useState('101')
  const [toNum, setToNum] = useState('110')
  const [steps, setSteps] = useState(DEFAULT_STEPS)
  // Apply state
  const [applyTemplateId, setApplyTemplateId] = useState('')
  const [selected, setSelected] = useState({})
  const [busy, setBusy] = useState(false)

  const loadTemplates = useCallback(() => {
    setLoading(true)
    api.get(withOrg(`/api/sis/gradebook/templates?class_id=${classId}`, orgId))
      .then((r) => setTemplates(r.data?.templates || []))
      .catch((e) => toast.error(e?.response?.data?.error || 'Failed to load sequences'))
      .finally(() => setLoading(false))
  }, [classId, orgId])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  const generatedItems = useMemo(() => {
    const from = parseInt(fromNum, 10)
    const to = parseInt(toNum, 10)
    const stepList = steps.split(',').map((s) => s.trim()).filter(Boolean)
    if (Number.isNaN(from) || Number.isNaN(to) || to < from || !stepList.length || !baseName.trim()) return []
    const items = []
    for (let n = from; n <= to; n++) {
      for (const step of stepList) {
        items.push({ name: `${baseName.trim()} ${n} - ${step}`, sort_order: items.length })
      }
    }
    return items
  }, [baseName, fromNum, toNum, steps])

  const saveTemplate = async () => {
    if (!generatedItems.length) { toast.error('Nothing to generate — check the fields'); return }
    setBusy(true)
    try {
      await api.post('/api/sis/gradebook/templates', {
        organization_id: orgId,
        class_id: classId,
        name: tplName.trim() || `${baseName.trim()} ${fromNum}-${toNum}`,
        items: generatedItems,
      })
      toast.success('Sequence saved')
      setTplName('')
      loadTemplates()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save the sequence')
    } finally {
      setBusy(false)
    }
  }

  const deleteTemplate = async (id) => {
    if (!window.confirm('Delete this sequence? Already-stamped assignments are kept.')) return
    try {
      await api.delete(withOrg(`/api/sis/gradebook/templates/${id}`, orgId))
      loadTemplates()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not delete the sequence')
    }
  }

  const apply = async () => {
    const studentIds = Object.keys(selected).filter((id) => selected[id])
    if (!applyTemplateId) { toast.error('Pick a sequence to apply'); return }
    if (!studentIds.length) { toast.error('Pick at least one student'); return }
    setBusy(true)
    try {
      const r = await api.post(`/api/sis/gradebook/templates/${applyTemplateId}/apply`, {
        organization_id: orgId, class_id: classId, student_ids: studentIds,
      })
      toast.success(`Added ${r.data?.created ?? 0} assignments${r.data?.skipped ? ` (${r.data.skipped} already existed)` : ''}`)
      onApplied()
      onClose()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not apply the sequence')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-neutral-900">Sequences</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-gray-100">
            <XMarkIcon className="w-5 h-5 text-neutral-500" />
          </button>
        </div>

        {/* Existing templates */}
        {loading ? <p className="text-sm text-neutral-500">Loading…</p> : (
          templates.length ? (
            <ul className="mb-5 divide-y divide-gray-100 border border-gray-200 rounded-lg">
              {templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{t.name}</p>
                    <p className="text-xs text-neutral-500">{(t.items || []).length} assignments</p>
                  </div>
                  <button onClick={() => deleteTemplate(t.id)} aria-label={`Delete ${t.name}`}
                    className="p-1.5 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-neutral-500 mb-5">No sequences yet — build one below.</p>
        )}

        {/* Generator */}
        <div className="border border-gray-200 rounded-lg p-4 mb-5">
          <h3 className="font-semibold text-neutral-900 text-sm mb-3">New sequence</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <label className="text-xs text-neutral-600 col-span-2">Base name
              <input value={baseName} onChange={(e) => setBaseName(e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </label>
            <label className="text-xs text-neutral-600">From
              <input type="number" value={fromNum} onChange={(e) => setFromNum(e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </label>
            <label className="text-xs text-neutral-600">To
              <input type="number" value={toNum} onChange={(e) => setToNum(e.target.value)}
                className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </label>
          </div>
          <label className="text-xs text-neutral-600 block mb-2">Steps per unit (comma-separated)
            <input value={steps} onChange={(e) => setSteps(e.target.value)}
              className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </label>
          <label className="text-xs text-neutral-600 block mb-3">Sequence name (optional)
            <input value={tplName} onChange={(e) => setTplName(e.target.value)}
              placeholder={`${baseName.trim() || 'Workbook'} ${fromNum}-${toNum}`}
              className="mt-0.5 w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </label>
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500">
              {generatedItems.length
                ? `${generatedItems.length} assignments, e.g. "${generatedItems[0].name}"`
                : 'Fill in the fields to preview'}
            </p>
            <button onClick={saveTemplate} disabled={busy || !generatedItems.length}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
              Save sequence
            </button>
          </div>
        </div>

        {/* Apply to students */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-neutral-900 text-sm mb-3">Apply to students</h3>
          <select value={applyTemplateId} onChange={(e) => setApplyTemplateId(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm mb-3">
            <option value="">Choose a sequence…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="max-h-40 overflow-y-auto mb-3 space-y-1">
            {students.map((s) => (
              <label key={s.student_user_id} className="flex items-center gap-2 text-sm text-neutral-800">
                <input type="checkbox" checked={!!selected[s.student_user_id]}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [s.student_user_id]: e.target.checked }))} />
                {s.name}
              </label>
            ))}
            {!students.length && <p className="text-sm text-neutral-500">No students enrolled.</p>}
          </div>
          <div className="flex justify-between items-center">
            <button onClick={() => {
              const all = {}
              for (const s of students) all[s.student_user_id] = true
              setSelected(all)
            }} className="text-sm text-optio-purple hover:underline">Select all</button>
            <button onClick={apply} disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Applying…' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}

const GradebookTab = ({ classId, orgId, className }) => {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [showSequences, setShowSequences] = useState(false)

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    api.get(withOrg(`/api/sis/gradebook/classes/${classId}`, orgId))
      .then((r) => setStudents(r.data?.students || []))
      .catch((e) => toast.error(e?.response?.data?.error || 'Failed to load the gradebook'))
      .finally(() => setLoading(false))
  }, [classId, orgId])

  useEffect(() => { load() }, [load])

  const patchRow = async (id, fields) => {
    try {
      await api.patch(`/api/sis/gradebook/assignments/${id}`, { organization_id: orgId, ...fields })
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save')
    }
  }

  const addRow = async (studentId) => {
    try {
      await api.post('/api/sis/gradebook/assignments', {
        organization_id: orgId, class_id: classId,
        student_user_id: studentId, name: 'New assignment',
      })
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not add a row')
    }
  }

  const deleteRow = async (id) => {
    if (!window.confirm('Delete this assignment row?')) return
    try {
      await api.delete(withOrg(`/api/sis/gradebook/assignments/${id}`, orgId))
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not delete the row')
    }
  }

  const saveScore = (row, text) => {
    const parsed = parseScore(text)
    if (parsed === null) { toast.error('Score must be a number or score/max, e.g. 85/100'); return }
    patchRow(row.id, parsed)
  }

  if (loading) return <p className="text-neutral-500">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-neutral-900">Gradebook</h2>
        <button onClick={() => setShowSequences(true)}
          className="px-3 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold">
          Sequences
        </button>
      </div>

      {!students.length && <p className="text-neutral-500">No students enrolled yet.</p>}

      <div className="space-y-3">
        {students.map((s) => {
          const open = !!expanded[s.student_user_id]
          return (
            <div key={s.student_user_id} className="bg-white rounded-xl border border-gray-200">
              <button type="button"
                onClick={() => setExpanded((prev) => ({ ...prev, [s.student_user_id]: !open }))}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                aria-expanded={open}>
                {s.avatar_url ? (
                  <img src={s.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-optio-purple/20 to-optio-pink/20 flex items-center justify-center text-xs font-semibold text-optio-purple">
                    {(s.name || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('')}
                  </div>
                )}
                <span className="font-semibold text-neutral-900 flex-1">{s.name}</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-optio-purple to-optio-pink text-white"
                  title="Current average">
                  {fmtAvg(s.average)}
                </span>
                <span className="text-xs text-neutral-400">{(s.assignments || []).length} rows</span>
              </button>

              {open && (
                <div className="px-4 pb-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-neutral-500 border-b border-gray-200">
                          <th className="py-1.5 pr-2 font-medium w-2/5">Assignment</th>
                          <th className="py-1.5 pr-2 font-medium">Scheduled</th>
                          <th className="py-1.5 pr-2 font-medium">Completed</th>
                          <th className="py-1.5 pr-2 font-medium">Score</th>
                          <th className="py-1.5 pr-2 font-medium">Notes</th>
                          <th className="py-1.5 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {(s.assignments || []).map((a) => (
                          <tr key={a.id} className="border-b border-gray-100">
                            <td className="pr-2">
                              <EditableCell value={a.name}
                                onSave={(v) => patchRow(a.id, { name: v })} />
                            </td>
                            <td className="pr-2">
                              <EditableCell value={a.date_scheduled} type="date"
                                onSave={(v) => patchRow(a.id, { date_scheduled: v || null })} />
                            </td>
                            <td className="pr-2">
                              <EditableCell value={a.date_completed} type="date"
                                onSave={(v) => patchRow(a.id, { date_completed: v || null })} />
                            </td>
                            <td className="pr-2">
                              <EditableCell value={fmtScore(a)} placeholder="e.g. 85/100"
                                onSave={(v) => saveScore(a, v)} />
                            </td>
                            <td className="pr-2">
                              <EditableCell value={a.notes}
                                onSave={(v) => patchRow(a.id, { notes: v || null })} />
                            </td>
                            <td>
                              <button onClick={() => deleteRow(a.id)} aria-label="Delete row"
                                className="p-1 rounded hover:bg-red-50 text-neutral-300 hover:text-red-600">
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {!(s.assignments || []).length && (
                          <tr><td colSpan={6} className="py-2 text-neutral-400">
                            No assignments yet — add a row or apply a sequence.
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <button onClick={() => addRow(s.student_user_id)}
                      className="text-sm text-optio-purple hover:underline">+ Add row</button>
                    <button onClick={() => printStudent(className, s)}
                      className="flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900">
                      <PrinterIcon className="w-4 h-4" /> Print
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showSequences && (
        <SequencesModal
          classId={classId}
          orgId={orgId}
          students={students}
          onClose={() => setShowSequences(false)}
          onApplied={load}
        />
      )}
    </div>
  )
}

export default GradebookTab
