import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'

import Button from '../../../components/ui/Button'
import SearchSelect from '../../../components/ui/SearchSelect'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { useSisRoster } from '../../../hooks/api/useSisRoster'
import { sisPeopleApi } from '../../../hooks/api/useSisPeople'

/**
 * A student's assigned teachers and linked parents, on the student record
 * (2026-10-15). Both were the web organization console's Relationships
 * section, which went away when every org became an SIS org.
 *
 * Assigned teachers (advisor_student_assignments) are not class teachers.
 * About thirty backend checks read this table to decide whether a teacher
 * may see a student's work, portfolio and progress outside a shared class,
 * so a school that never sets it has teachers who can see less than they
 * think. The staff record's Students tab is the same table seen from the
 * teacher's side.
 *
 * Linked parents (parent_student_links) are who can act as this child's
 * parent in Optio. A parent is LINKED through the family record ("+ Add
 * member" as guardian links them to the family's children), so there is no
 * second "link a parent" door here. Removing someone from a family does not
 * remove the link, though, and a link can exist with no family at all -- so
 * the record lists the links and can disconnect one, which nothing else in
 * the console could.
 */

const nameOf = (p) => (p ? (`${p.first_name || ''} ${p.last_name || ''}`.trim() || p.display_name || p.email || 'Unknown') : 'Unknown')

const SectionTitle = ({ children }) => (
  <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">{children}</h4>
)

export const isTeacherRow = (r) => (r.roles || [r.role]).some((x) => x === 'advisor' || x === 'org_admin')

export function AssignedTeachers({ student, orgId }) {
  const confirm = useConfirm()
  const { data: roster = [] } = useSisRoster(orgId)
  const [advisors, setAdvisors] = useState(null)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    sisPeopleApi.studentAdvisors(orgId, student.student_id)
      .then((r) => setAdvisors(r.data?.advisors || []))
      .catch(() => setAdvisors([]))
  }, [orgId, student.student_id])
  useEffect(() => { load() }, [load])

  const options = useMemo(() => {
    const have = new Set((advisors || []).map((a) => a.advisor_id))
    return roster.filter((r) => isTeacherRow(r) && !r.is_placeholder && !have.has(r.student_id))
  }, [roster, advisors])

  const assign = async () => {
    if (!chosen) { toast.error('Pick a teacher'); return }
    setBusy(true)
    try {
      await sisPeopleApi.assignStudent(orgId, chosen, student.student_id)
      setChosen('')
      toast.success('Teacher assigned')
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not assign the teacher')
    } finally {
      setBusy(false)
    }
  }

  const unassign = async (a) => {
    const who = a.display_name || nameOf(a)
    if (!(await confirm(`Remove ${who} as ${student.name}'s assigned teacher?`))) return
    try {
      await sisPeopleApi.unassignStudent(orgId, a.advisor_id, student.student_id)
      toast.success(`${who} removed`)
      load()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not remove the teacher')
    }
  }

  return (
    <section className="border-t border-gray-100 pt-4" data-testid="assigned-teachers">
      <SectionTitle>Assigned teachers</SectionTitle>
      <p className="text-xs text-neutral-400 mb-2">
        An assigned teacher can see this student&apos;s work and progress, including outside their own classes.
      </p>
      {advisors === null ? <p className="text-sm text-neutral-400">Loading…</p> : (
        <>
          {advisors.length === 0 && <p className="text-sm text-neutral-400 mb-2">No assigned teachers.</p>}
          <ul className="space-y-1 mb-2">
            {advisors.map((a) => (
              <li key={a.advisor_id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-neutral-800">{a.display_name || nameOf(a)}</span>
                  {a.email && <span className="text-xs text-neutral-400 ml-2">{a.email}</span>}
                </span>
                <button type="button" onClick={() => unassign(a)}
                  className="text-xs font-medium text-red-600 hover:underline">Remove</button>
              </li>
            ))}
          </ul>
          {options.length > 0 && (
            <div className="flex gap-2">
              <SearchSelect value={chosen} onChange={setChosen} options={options}
                getId={(r) => r.student_id} getLabel={(r) => r.name}
                placeholder="Search teachers…" className="flex-1" />
              <Button size="sm" onClick={assign} loading={busy}>Assign</Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function LinkedParents({ student, orgId, onSaved }) {
  const confirm = useConfirm()
  const [links, setLinks] = useState(null)

  const load = useCallback(() => {
    sisPeopleApi.studentParentLinks(orgId, student.student_id)
      .then((r) => setLinks(r.data?.links || []))
      .catch(() => setLinks([]))
  }, [orgId, student.student_id])
  useEffect(() => { load() }, [load])

  const disconnect = async (link) => {
    const who = nameOf(link.parent)
    if (!(await confirm({
      title: `Disconnect ${who} from ${student.name}?`,
      body: `${who} stops seeing ${student.name} as their child in Optio. If they are in the same family, remove them from the family too, or the family record still shows them together.`,
      confirmLabel: 'Disconnect',
      cancelLabel: 'Keep',
    }))) return
    try {
      await sisPeopleApi.disconnectParentLink(orgId, link.id)
      toast.success(`${who} disconnected`)
      load()
      onSaved?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not disconnect')
    }
  }

  return (
    <section className="border-t border-gray-100 pt-4" data-testid="linked-parents">
      <SectionTitle>Linked parents</SectionTitle>
      {links === null ? <p className="text-sm text-neutral-400">Loading…</p> : (
        <>
          {links.length === 0 && (
            <p className="text-sm text-neutral-400">
              No linked parents. Add a parent to this student&apos;s family to link them.
            </p>
          )}
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-neutral-800">{nameOf(l.parent)}</span>
                  {l.parent?.email && <span className="text-xs text-neutral-400 ml-2">{l.parent.email}</span>}
                </span>
                <button type="button" onClick={() => disconnect(l)}
                  className="text-xs font-medium text-red-600 hover:underline">Disconnect</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
