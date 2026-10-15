import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import Button from '../../ui/Button'
import { INPUT_CLASS } from '../../ui/Input'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { sisPeopleApi } from '../../../hooks/api/useSisPeople'

/**
 * The staff record's Students tab: the students assigned to this teacher
 * (advisor_student_assignments), with assign and remove.
 *
 * It was the web organization console's Relationships section until
 * 2026-10-15, when every org became an SIS org. It matters more than its size
 * suggests: about thirty backend checks read this table to decide whether a
 * teacher may see a student's work outside a class they share. The student
 * record shows the same table from the student's side (Assigned teachers).
 */

const nameOf = (s) => `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.display_name || s.email || 'Student'

export const showsStudentsTab = (staff) => !staff.is_placeholder
  && (staff.roles || []).some((r) => r === 'advisor' || r === 'org_admin')

const StudentsPanel = ({ orgId, staff }) => {
  const confirm = useConfirm()
  const [assigned, setAssigned] = useState(null)
  const [picking, setPicking] = useState(false)
  const [all, setAll] = useState(null)
  const [query, setQuery] = useState('')
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  const [chosen, setChosen] = useState(() => new Set())
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    sisPeopleApi.advisorStudents(orgId, staff.id)
      .then((r) => setAssigned(r.data?.students || []))
      .catch(() => { setAssigned([]); toast.error('Could not load assigned students') })
  }, [orgId, staff.id])
  useEffect(() => { load() }, [load])

  const openPicker = () => {
    setPicking(true)
    setChosen(new Set())
    sisPeopleApi.studentsWithAdvisors(orgId)
      .then((r) => setAll(r.data?.students || []))
      .catch(() => setAll([]))
  }

  const candidates = useMemo(() => {
    const have = new Set((assigned || []).map((s) => s.id))
    const q = query.trim().toLowerCase()
    return (all || []).filter((s) => !have.has(s.id)
      && (!unassignedOnly || !s.advisor_count)
      && (!q || nameOf(s).toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)))
  }, [all, assigned, query, unassignedOnly])

  const toggle = (id) => setChosen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const assign = async () => {
    setSaving(true)
    const ids = [...chosen]
    const results = await Promise.allSettled(ids.map((id) => sisPeopleApi.assignStudent(orgId, staff.id, id)))
    const failed = results.filter((r) => r.status === 'rejected')
    const done = ids.length - failed.length
    if (done) toast.success(`${done} student${done === 1 ? '' : 's'} assigned to ${staff.name}`)
    if (failed.length) toast.error(failed[0].reason?.response?.data?.error || `${failed.length} could not be assigned`)
    setSaving(false)
    setPicking(false)
    load()
  }

  const remove = async (s) => {
    if (!(await confirm(`Remove ${nameOf(s)} from ${staff.name}'s students?`))) return
    try {
      await sisPeopleApi.unassignStudent(orgId, staff.id, s.id)
      toast.success(`${nameOf(s)} removed`)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not remove the student')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        Assigned students are the ones {staff.name} looks after. They can see these students&apos;
        work and progress, including outside their own classes.
      </p>

      {assigned === null ? <p className="text-sm text-neutral-400">Loading…</p> : (
        <>
          {assigned.length === 0
            ? <p className="text-sm text-neutral-400">No students assigned yet.</p>
            : (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" aria-label="Assigned students">
                {assigned.map((s) => (
                  <li key={s.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-neutral-800">{nameOf(s)}</span>
                      {s.email && <span className="text-xs text-neutral-400 ml-2">{s.email}</span>}
                    </span>
                    <button type="button" onClick={() => remove(s)}
                      className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                  </li>
                ))}
              </ul>
            )}
        </>
      )}

      {!picking ? (
        <Button size="sm" variant="secondary" onClick={openPicker}>Assign students</Button>
      ) : (
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input className={`${INPUT_CLASS} flex-1 min-w-[12rem]`} value={query} placeholder="Search students…"
              aria-label="Search students" onChange={(e) => setQuery(e.target.value)} />
            <label className="inline-flex items-center gap-1.5 text-sm text-neutral-600">
              <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
              Only students with no teacher
            </label>
          </div>
          {all === null ? <p className="text-sm text-neutral-400">Loading…</p>
            : candidates.length === 0 ? <p className="text-sm text-neutral-400">No students match.</p>
            : (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
                {candidates.map((s) => (
                  <li key={s.id} className="px-3 py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={chosen.has(s.id)} onChange={() => toggle(s.id)}
                        className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                      <span>{nameOf(s)}</span>
                      {s.advisor_count > 0 && (
                        <span className="text-xs text-neutral-400">
                          {s.advisor_count} teacher{s.advisor_count === 1 ? '' : 's'} already
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPicking(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={assign} loading={saving} disabled={chosen.size === 0}>
              {`Assign ${chosen.size || ''} student${chosen.size === 1 ? '' : 's'}`.replace('  ', ' ')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default StudentsPanel
