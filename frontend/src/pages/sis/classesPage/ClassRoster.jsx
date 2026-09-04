/**
 * Extracted from sis/ClassesPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import Button from '../../../components/ui/Button'
import ClassRosterExportModal from '../../../components/sis/ClassRosterExportModal'
import SearchSelect from '../../../components/ui/SearchSelect'
import api from '../../../services/api'
import { toast } from 'react-hot-toast'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { useSisOrg, withOrg } from '../useSisOrg'

const ClassRoster = ({ classId, className, orgId, onChanged }) => {
  const confirm = useConfirm()
  const [roster, setRoster] = useState(null)
  const [dropping, setDropping] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [people, setPeople] = useState([])
  const [adding, setAdding] = useState('')        // student id chosen in the picker
  const [busy, setBusy] = useState(false)
  const [sections, setSections] = useState([])
  const [movingId, setMovingId] = useState(null)  // whose section picker is open

  const reload = useCallback(() => {
    api.get(withOrg(`/api/sis/classes/${classId}/enrollments`, orgId))
      .then((r) => setRoster(r.data?.roster || []))
      .catch(() => { toast.error('Failed to load the roster'); setRoster([]) })
  }, [classId, orgId])
  useEffect(() => { reload() }, [reload])

  // The org's students, for the add picker, and the other sections with room.
  useEffect(() => {
    api.get(withOrg('/api/sis/roster', orgId))
      .then((r) => setPeople((r.data?.roster || []).filter((p) => p.is_student)))
      .catch(() => setPeople([]))
    api.get(withOrg(`/api/sis/classes/${classId}/sibling-sections`, orgId))
      .then((r) => setSections(r.data?.sections || []))
      .catch(() => setSections([]))
  }, [classId, orgId])

  const drop = async (s) => {
    if (!(await confirm(`Drop ${s.name} from this class?`))) return
    setDropping(s.student_id)
    try {
      await api.delete(withOrg(`/api/sis/classes/${classId}/enrollments/${s.student_id}`, orgId))
      toast.success(`Dropped ${s.name}`)
      reload()
      onChanged?.()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not drop the student') }
    finally { setDropping(null) }
  }

  // Enrolling someone still waiting for a place AT THE SCHOOL comes back as a
  // 409, exactly as it does from the student's own page, and is confirmed
  // before forcing.
  const add = async (force = false) => {
    if (!adding) return
    setBusy(true)
    try {
      const r = await api.post(`/api/sis/classes/${classId}/enrollments`,
        { organization_id: orgId, student_user_id: adding, force })
      toast.success(r.data?.already_enrolled ? 'Already on this roster' : 'Added to the class')
      setAdding('')
      reload()
      onChanged?.()
    } catch (e) {
      if (e?.response?.status === 409 && e.response.data?.enrollment_waitlisted) {
        setBusy(false)
        if (await confirm(`${e.response.data.error}\n\nAdd them anyway?`)) return add(true)
        return
      }
      toast.error(e?.response?.data?.error || 'Could not add the student')
    } finally { setBusy(false) }
  }

  // Into the new section first, out of this one second: a failure halfway
  // through must leave them somewhere, and a student in two sections for a
  // moment is a smaller problem than a student in none.
  const move = async (s, section) => {
    setMovingId(null)
    setDropping(s.student_id)
    try {
      // force: they already hold a seat in a section of this very class, so the
      // school-waitlist question has been answered.
      await api.post(`/api/sis/classes/${section.class_id}/enrollments`,
        { organization_id: orgId, student_user_id: s.student_id, force: true })
      await api.delete(withOrg(`/api/sis/classes/${classId}/enrollments/${s.student_id}`, orgId))
      toast.success(`Moved ${s.name} to ${section.name}`)
      reload()
      onChanged?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not move the student')
    } finally { setDropping(null) }
  }

  const enrolledIds = new Set((roster || []).map((s) => s.student_id))
  const addable = people.filter((p) => !enrolledIds.has(p.student_id))

  const addRow = (
    <div className="flex items-end gap-2 mb-3">
      <div className="flex-1 min-w-0">
        <label className="block text-xs text-neutral-500 mb-1" htmlFor={`add-${classId}`}>Add a student</label>
        <SearchSelect
          value={adding}
          onChange={setAdding}
          options={addable}
          getId={(p) => p.student_id}
          getLabel={(p) => (p.age != null ? `${p.name} (age ${p.age})` : p.name)}
          placeholder="Search students…"
        />
      </div>
      <Button size="sm" disabled={!adding || busy} onClick={() => add()}>
        {busy ? 'Adding…' : 'Add'}
      </Button>
    </div>
  )

  if (roster === null) return <p className="text-sm text-neutral-400">Loading…</p>
  if (!roster.length) {
    return (
      <div>
        {addRow}
        <p className="text-sm text-neutral-400">No students enrolled yet.</p>
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs text-neutral-400">{roster.length} enrolled</p>
        {/* Sign-in sheets, contact lists, allergy lists — see the modal. */}
        <Button size="sm" variant="outline" onClick={() => setExporting(true)}>
          Print / Export
        </Button>
      </div>
      {addRow}
      {exporting && (
        <ClassRosterExportModal classId={classId} className={className} orgId={orgId}
          onClose={() => setExporting(false)} />
      )}
      <ul className="divide-y divide-gray-100">
        {roster.map((s) => (
          <li key={s.student_id} className="py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-neutral-800">
                {s.name}
                {s.age != null && <span className="ml-1.5 text-xs font-normal text-neutral-400">age {s.age}</span>}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-neutral-400 truncate max-w-[10rem]">{s.email || s.username || ''}</span>
                {sections.length > 0 && (
                  <Button size="sm" variant="outline" disabled={dropping === s.student_id}
                    onClick={() => setMovingId(movingId === s.student_id ? null : s.student_id)}>
                    Move
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={dropping === s.student_id} onClick={() => drop(s)}>
                  {dropping === s.student_id ? '…' : 'Drop'}
                </Button>
              </div>
            </div>
            {movingId === s.student_id && (
              <div className="mt-2 rounded-lg bg-gray-50 border border-gray-100 p-2">
                <p className="text-xs text-neutral-500 mb-1">Other sections with room:</p>
                <div className="flex flex-wrap gap-2">
                  {sections.map((sec) => (
                    <button key={sec.class_id} type="button" onClick={() => move(s, sec)}
                      className="px-2 py-1 rounded-lg border border-gray-300 text-xs text-neutral-700 hover:bg-white">
                      {sec.name}
                      {sec.spots_left != null && (
                        <span className="ml-1 text-neutral-400">{sec.spots_left} left</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Status label + tone for a waitlist row. 'expired' is deliberately not a dead
// end any more — staff can re-offer it or admit the student outright.

export default ClassRoster
