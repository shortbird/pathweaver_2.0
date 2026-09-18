import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { sisStudentApi } from '../../hooks/api/useSisStudentDetail'
import { queryKeys } from '../../utils/queryKeys'
import { useSisOrg } from '../../pages/sis/useSisOrg'
import StudentDetailModal from '../../pages/sis/StudentDetailModal'

/**
 * The one door onto a person's record.
 *
 * StudentDetailModal is the student's record: profile, family, emergency
 * contacts, the school's record and materials, the schedule, a message. Until
 * M13a (2026-09-18) it was mounted by whichever page wanted it (People, the
 * family record), and the surfaces that did not mount it -- the CLP meeting,
 * a class roster, the learning app's admin page -- drew a partial student of
 * their own instead (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, G-1).
 * SisLayout mounts the modal once, through this provider, and anything in
 * the console opens it:
 *
 *   const { openStudent } = useRecordDoors()
 *   openStudent(row)                       // a roster row you already hold
 *   openStudent(userId, { onSaved })       // an id: the record is fetched first
 *
 * A save inside the modal re-reads the person, so the open record stays in
 * step with itself, then invalidates the roster and household lists and calls
 * the opener's onSaved -- the same refresh every opener used to wire by hand.
 *
 * Outside the provider (tests render pages bare) the doors are closed:
 * openStudent is a no-op. A test that asserts on the modal wraps its page in
 * <RecordDoorsProvider>.
 */

const RecordDoorsContext = createContext(null)

const CLOSED = { openStudent: () => {}, closeStudent: () => {} }

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

  const value = useMemo(() => ({ openStudent, closeStudent }), [openStudent, closeStudent])

  return (
    <RecordDoorsContext.Provider value={value}>
      {children}
      {student && (
        <StudentDetailModal student={student.row} orgId={orgId} onClose={closeStudent} onSaved={savedStudent} />
      )}
    </RecordDoorsContext.Provider>
  )
}

export const useRecordDoors = () => useContext(RecordDoorsContext) || CLOSED

export default RecordDoorsProvider
