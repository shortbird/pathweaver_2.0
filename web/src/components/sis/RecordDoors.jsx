import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { sisStudentApi } from '../../hooks/api/useSisStudentDetail'
import { useSisHouseholds } from '../../hooks/api/useSisHouseholds'
import { useSisRoster } from '../../hooks/api/useSisRoster'
import { queryKeys } from '../../utils/queryKeys'
import { useSisOrg } from '../../pages/sis/useSisOrg'
import StudentDetailModal from '../../pages/sis/StudentDetailModal'
import FamilyDetailModal from '../../pages/sis/FamilyDetailModal'
import StaffDetailModal from './StaffDetailModal'
import { asStaffRow } from '../../pages/sis/people/peopleFilters'
import { RecordDoorsContext, useRecordDoors } from './recordDoorsContext'

/**
 * The one door onto a person's record, and the one onto a family's.
 *
 * StudentDetailModal is the student's record: profile, family, emergency
 * contacts, the school's record and materials, the schedule, a message.
 * FamilyDetailModal is the family's: members, details, billing, contacts,
 * registration. Until M13a/b (2026-09-18) each was mounted by whichever page
 * wanted it, and the surfaces that did not mount one -- the CLP meeting, a
 * class roster, the Billing page, the recurring-tuition list, the directives
 * card, the learning app's admin page -- drew a partial student or family of
 * their own, or sent the office to People (audit G-1, G-2). SisLayout mounts
 * both modals once, through this provider, and anything in the console opens
 * them:
 *
 *   const { openStudent, openFamily } = useRecordDoors()
 *   openStudent(row)                          // a roster row you already hold
 *   openStudent(userId, { onSaved })          // an id: the record is fetched first
 *   openFamily(householdId, { tab, onSaved }) // an id or a household row; tab
 *                                             // 'billing' lands on Billing
 *   openStaff(row, { tab, onSaved, onViewPortal }) // a roster row (or the
 *                                             // staff endpoint's row shape)
 *
 * A family opens over a student and a student over a family (a member's name
 * in the family record, the family's name in the student's), which is why
 * the family renders after the student here: the one opened last is on top.
 *
 * A save inside a modal re-reads what it shows, so the open record stays in
 * step with itself, then invalidates the roster and household lists and calls
 * the opener's onSaved -- the same refresh every opener used to wire by hand.
 *
 * Outside the provider (tests render pages bare) the doors are closed: both
 * openers are no-ops. A test that asserts on a modal wraps its page in
 * <RecordDoorsProvider>. The hook lives in recordDoorsContext.js so the two
 * modals can use it without importing this file back.
 */

const fetchPerson = async (userId, orgId) => {
  const r = await sisStudentApi.getPerson(userId, orgId)
  return r.data?.user || null
}

export const RecordDoorsProvider = ({ children }) => {
  const { orgId } = useSisOrg()
  const queryClient = useQueryClient()
  // { row, onSaved } while a student record is open.
  const [student, setStudent] = useState(null)

  const openStudent = useCallback(async (idOrRow, { onSaved } = {}) => {
    if (!idOrRow) return
    if (typeof idOrRow === 'string') {
      try {
        const row = await fetchPerson(idOrRow, orgId)
        if (!row) { toast.error('That person is not in this school'); return }
        setStudent({ row, onSaved })
      } catch (e) {
        toast.error(e?.response?.data?.error || 'Could not open the record')
      }
      return
    }
    setStudent({ row: idOrRow, onSaved })
  }, [orgId])

  const closeStudent = useCallback(() => setStudent(null), [])

  const savedStudent = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.roster(orgId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.households(orgId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.householdList(orgId) })
    student?.onSaved?.()
    // The row the modal was opened with is what it shows; refresh it so a
    // family assigned or a name changed is on screen without reopening.
    const id = student?.row?.student_id
    if (!id) return
    try {
      const row = await fetchPerson(id, orgId)
      if (row) setStudent((s) => (s && s.row.student_id === id ? { ...s, row } : s))
    } catch { /* the modal keeps what it has */ }
  }, [orgId, queryClient, student])

  // { id, tab, onSaved } while a family record is open. The household row
  // comes from the families query, so a save that invalidates it refreshes
  // the open record; the roster feeds the add-member picker.
  const [family, setFamily] = useState(null)
  // { row, tab, onSaved, onViewPortal } while a staff record is open. The
  // row is what the roster (or the staff endpoint) gave the opener; once the
  // roster query holds the person, the record reads them from there, so a
  // save that invalidates it refreshes the open record.
  const [staff, setStaff] = useState(null)
  const { data: familyData } = useSisHouseholds(orgId, { enabled: Boolean(orgId && family) })
  const { data: roster = [] } = useSisRoster(orgId, { enabled: Boolean(orgId && (family || staff)) })
  const household = family ? (familyData?.households || []).find((h) => h.id === family.id) : null
  const memberOptions = useMemo(
    () => roster.map((r) => ({ id: r.student_id, name: r.name, email: r.email, is_student: r.is_student })),
    [roster],
  )
  // An id the families query does not know (another school's, or deleted)
  // opens nothing; say so once. The stale request stays until the next open
  // replaces it rather than being cleared from inside an effect.
  useEffect(() => {
    if (family && familyData && !household) toast.error('That family is not in this school')
  }, [family, familyData, household])

  const openFamily = useCallback((idOrRow, { tab = null, onSaved } = {}) => {
    const id = typeof idOrRow === 'string' ? idOrRow : idOrRow?.id
    if (!id) return
    setFamily({ id, tab, onSaved })
  }, [])

  const closeFamily = useCallback(() => setFamily(null), [])

  const savedFamily = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.roster(orgId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.households(orgId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.householdList(orgId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.staff(orgId) })
    family?.onSaved?.()
  }, [orgId, queryClient, family])

  const openStaff = useCallback((row, { tab = 'profile', onSaved, onViewPortal } = {}) => {
    if (!row) return
    setStaff({ row: row.id ? row : asStaffRow(row), tab, onSaved, onViewPortal })
  }, [])
  const closeStaff = useCallback(() => setStaff(null), [])
  const staffRow = useMemo(() => {
    if (!staff) return null
    const fresh = roster.find((r) => r.student_id === staff.row.id)
    return fresh ? asStaffRow(fresh) : staff.row
  }, [staff, roster])
  const savedStaff = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.roster(orgId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.staff(orgId) })
    staff?.onSaved?.()
  }, [orgId, queryClient, staff])
  const removedStaff = useCallback(() => {
    setStaff(null)
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.roster(orgId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.sis.staff(orgId) })
    staff?.onSaved?.()
  }, [orgId, queryClient, staff])

  const value = useMemo(
    () => ({ openStudent, closeStudent, openFamily, closeFamily, openStaff, closeStaff }),
    [openStudent, closeStudent, openFamily, closeFamily, openStaff, closeStaff],
  )

  return (
    <RecordDoorsContext.Provider value={value}>
      {children}
      {student && (
        <StudentDetailModal student={student.row} orgId={orgId} onClose={closeStudent} onSaved={savedStudent} />
      )}
      {household && (
        <FamilyDetailModal household={household} orgId={orgId} members={memberOptions}
          initialTab={family.tab} onClose={closeFamily} onSaved={savedFamily} />
      )}
      {staffRow && (
        <StaffDetailModal orgId={orgId} staff={staffRow} initialTab={staff.tab}
          onClose={closeStaff} onSaved={savedStaff} onViewPortal={staff.onViewPortal} onRemoved={removedStaff} />
      )}
    </RecordDoorsContext.Provider>
  )
}

export { useRecordDoors }

export default RecordDoorsProvider
