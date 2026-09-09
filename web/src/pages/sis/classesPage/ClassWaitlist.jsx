/**
 * Extracted from sis/ClassesPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import Button from '../../../components/ui/Button'
import SearchSelect from '../../../components/ui/SearchSelect'
import api from '../../../services/api'
import { toast } from 'react-hot-toast'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { useSisOrg, withOrg } from '../useSisOrg'
import WAITLIST_STATUS from './WAITLIST_STATUS'
import offerExpiryText from './offerExpiryText'

const ClassWaitlist = ({ classId, orgId, cls, onChanged }) => {
  const confirm = useConfirm()
  const [entries, setEntries] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(null)
  // Other sections of the same class that still have room. Nine students sat on
  // one Ukelele Jam section's waitlist while two others had seats — the seat
  // they want exists, just at another time (iCreate, 2026-07-31).
  const [sections, setSections] = useState([])
  const [movingId, setMovingId] = useState(null)   // entry whose section picker is open
  const [people, setPeople] = useState([])         // org students, for the add picker
  const [adding, setAdding] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  const reload = useCallback(() => {
    api.get(`/api/sis/classes/${classId}/waitlist?organization_id=${orgId}`)
      .then((r) => setEntries(r.data?.waitlist || []))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [classId, orgId])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    api.get(withOrg(`/api/sis/classes/${classId}/sibling-sections`, orgId))
      .then((r) => setSections(r.data?.sections || []))
      .catch(() => setSections([]))
    api.get(withOrg('/api/sis/roster', orgId))
      .then((r) => setPeople((r.data?.roster || []).filter((p) => p.is_student)))
      .catch(() => setPeople([]))
  }, [classId, orgId])

  // Put a student on this waitlist by hand. Families join it themselves in the
  // Schedule Builder, but the office takes the ask on the phone and at the desk
  // and had nowhere to record it (iCreate, 2026-09-02). Same 409-then-confirm
  // shape as the roster's Add: a student still waiting for a place at the
  // SCHOOL is a warning, not a wall.
  const addToWaitlist = async (force = false) => {
    if (!adding) return
    setAddBusy(true)
    try {
      await api.post(`/api/sis/classes/${classId}/waitlist`,
        { organization_id: orgId, student_user_id: adding, force })
      toast.success('Added to the waitlist')
      setAdding('')
      reload()
      onChanged?.()
    } catch (e) {
      if (e?.response?.status === 409 && e.response.data?.enrollment_waitlisted) {
        setAddBusy(false)
        if (await confirm(`${e.response.data.error}\n\nAdd them anyway?`)) return addToWaitlist(true)
        return
      }
      toast.error(e?.response?.data?.error || 'Could not add the student')
    } finally { setAddBusy(false) }
  }

  // A seat can only be offered when one is actually open. Offering into a full
  // class enrolls someone over capacity, so the button is disabled until a seat
  // frees up (a drop, or raising the capacity).
  const capacity = cls?.capacity
  const enrolled = cls?.enrolled_count ?? 0
  const isFull = cls?.is_full ?? (capacity != null && enrolled >= capacity)

  const offerNext = async () => {
    try {
      const r = await api.post(`/api/sis/classes/${classId}/waitlist/offer-next`, { organization_id: orgId })
      // Name who — an unnamed "next student" left the office with no record of
      // who had been offered the seat (iCreate, 2026-08-17).
      if (r.data?.entry) toast.success(`Seat offered to ${r.data.entry.student_name || 'the next student'}`)
      else toast(r.data?.message || 'No one is waiting for this class', { icon: 'ℹ️' })
      reload()
    } catch { toast.error('Could not offer seat') }
  }

  // Nobody to offer to when every live entry already has an offer out — the
  // per-entry Offer again / Enroll now buttons are the way forward there.
  const waitingCount = entries.filter((e) => e.status === 'waiting').length
  // Still queued for a seat — the number the office reads as "the waitlist".
  const liveCount = entries.filter((e) => e.status === 'waiting' || e.status === 'offered').length

  // Admit the student now. The school already decided — this doesn't wait for
  // the family to click Claim, and it isn't blocked by a full class.
  // A clash with something they already attend comes back as a 409 and is
  // confirmed before forcing — admitting off the waitlist is how a student
  // ended up in two Wednesday microschool sections at once.
  const enroll = async (e, force = false) => {
    if (!force && !(await confirm(`Enroll ${e.student_name} in ${cls?.name || 'this class'} now?`))) return
    setBusy(e.id)
    try {
      await api.post(`/api/sis/waitlist/${e.id}/enroll`, { organization_id: orgId, force })
      toast.success(`${e.student_name} enrolled`)
      reload()
      onChanged?.()
    } catch (err) {
      const clash = err?.response?.status === 409 && err.response.data?.conflicts
      if (clash?.length) {
        const names = clash.map((c) => c.class_name || c.name).filter(Boolean).join(', ')
        if (await confirm(
          `${e.student_name} already has ${names} at that time.\n\n`
          + `Enroll in ${cls?.name || 'this class'} anyway? They'll be in both.`)) {
          return enroll(e, true)
        }
        return
      }
      toast.error(err?.response?.data?.error || 'Could not enroll the student')
    } finally { setBusy(null) }
  }

  // Hand the other section's seat to the FAMILY to claim. The office can see
  // the open seat; only they can see whether that time works — "can we OFFER
  // them the seat since we don't know what their schedule is?" (iCreate).
  const offerSection = async (e, section) => {
    setBusy(e.id)
    setMovingId(null)
    try {
      await api.post(`/api/sis/waitlist/${e.id}/offer-section`, {
        organization_id: orgId, class_id: section.class_id,
      })
      toast.success(`${section.name} offered to ${e.student_name}`)
      reload()
      onChanged?.()   // an offer holds a seat, so spots_left and Full move too
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not offer that section')
    } finally { setBusy(null) }
  }

  // Put them in it outright — for when the office already knows the time works.
  // A clash with something they already attend comes back as a 409 and is
  // confirmed before forcing.
  const enrollInSection = async (e, section, force = false) => {
    setBusy(e.id)
    setMovingId(null)
    try {
      await api.post(`/api/sis/waitlist/${e.id}/enroll`, {
        organization_id: orgId, class_id: section.class_id, force,
      })
      toast.success(`${e.student_name} enrolled in ${section.name}`)
      reload()
      onChanged?.()
    } catch (err) {
      const clash = err?.response?.status === 409 && err.response.data?.conflicts
      if (clash) {
        const names = clash.map((c) => c.class_name || c.name).filter(Boolean).join(', ')
        if (await confirm(
          `${e.student_name} already has ${names} at that time.\n\n`
          + `Enroll in ${section.name} anyway? They'll be in both.`)) {
          return enrollInSection(e, section, true)
        }
        return
      }
      toast.error(err?.response?.data?.error || 'Could not move the student')
    } finally { setBusy(null) }
  }

  const offer = async (e) => {
    setBusy(e.id)
    try {
      await api.post(`/api/sis/waitlist/${e.id}/offer`, { organization_id: orgId })
      toast.success(`Seat offered to ${e.student_name}`)
      reload()
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not offer the seat')
    } finally { setBusy(null) }
  }

  const remove = async (e) => {
    if (!(await confirm(`Remove ${e.student_name} from this waitlist?`))) return
    setBusy(e.id)
    try {
      await api.delete(`/api/sis/waitlist/${e.id}?organization_id=${orgId}`)
      toast.success('Removed from the waitlist')
      reload()
      onChanged?.()
    } catch { toast.error('Could not remove the entry') } finally { setBusy(null) }
  }

  const queuedIds = new Set(entries.filter((e) => e.status === 'waiting' || e.status === 'offered')
    .map((e) => e.student_user_id))
  const addRow = (
    <div className="flex items-end gap-2 mb-3">
      <div className="flex-1 min-w-0">
        <label className="block text-xs text-neutral-500 mb-1" htmlFor={`wl-add-${classId}`}>
          Add a student to the waitlist
        </label>
        <SearchSelect
          value={adding}
          onChange={setAdding}
          options={people.filter((p) => !queuedIds.has(p.student_id))}
          getId={(p) => p.student_id}
          getLabel={(p) => (p.age != null ? `${p.name} (age ${p.age})` : p.name)}
          placeholder="Search students…"
        />
      </div>
      <Button size="sm" disabled={!adding || addBusy} onClick={() => addToWaitlist()}>
        {addBusy ? 'Adding…' : 'Add'}
      </Button>
    </div>
  )

  if (loaded && !entries.length) {
    return (
      <div className="border-t border-gray-100 mt-3 pt-3">
        {addRow}
        <p className="text-sm text-neutral-400">No one on the waitlist.</p>
      </div>
    )
  }

  return (
    <div className="border-t border-gray-100 mt-3 pt-3">
      <div className="flex items-center justify-between mb-2">
        {/* The count is the LIVE queue. Promoted/declined/expired rows stay in
            the list as history, but counting them meant the number never moved
            when a student was enrolled (iCreate, 2026-08-13: "If someone is
            enrolled, then the waitlist number should go down"). Matches
            waitlist_count everywhere else: waiting + offered. */}
        <span className="text-sm font-medium text-neutral-700">Waitlist ({liveCount})</span>
        <Button size="sm" variant="secondary" onClick={offerNext} disabled={isFull || !waitingCount}
          title={isFull
            ? 'The class is full — free a seat or raise the capacity to offer one'
            : (!waitingCount
              ? 'Nobody is waiting — everyone here already has an offer out. Use Offer again or Enroll now.'
              : undefined)}>
          Offer next seat
        </Button>
      </div>
      {isFull && (
        <p className="text-xs text-neutral-400 mb-2">
          Class is full ({enrolled}/{capacity}). Drop a student or raise the capacity to offer a seat.
        </p>
      )}
      {addRow}
      <div className="space-y-1">
        {entries.map((e) => {
          const meta = WAITLIST_STATUS[e.status] || { label: e.status, tone: 'text-neutral-400' }
          const expiry = offerExpiryText(e)
          const done = e.status === 'promoted'
          return (
            <div key={e.id} className="flex items-center justify-between gap-3 text-sm py-0.5">
              {/* Only the NAME may truncate. Age and status used to share the
                  truncating span, so on a long name they were the first thing
                  clipped — which is why the age looked missing rather than
                  absent (iCreate, 2026-08-13: "I also can't see the age here"). */}
              <span className="text-neutral-700 min-w-0 flex items-baseline gap-1.5">
                <span className="min-w-0 truncate">#{e.position} · {e.student_name}</span>
                {e.student_age != null && <span className="shrink-0 text-xs text-neutral-400">age {e.student_age}</span>}
                <span className={`shrink-0 text-xs ${meta.tone}`}>{meta.label}</span>
                {expiry && <span className="shrink-0 text-xs text-neutral-400">({expiry})</span>}
              </span>
              {!done && (
                <span className="flex items-center gap-2 shrink-0 text-xs">
                  <button onClick={() => enroll(e)} disabled={busy === e.id}
                    className="text-optio-purple hover:underline disabled:opacity-50">
                    Enroll now
                  </button>
                  <button onClick={() => offer(e)} disabled={busy === e.id}
                    className="text-neutral-500 hover:underline disabled:opacity-50">
                    {e.status === 'waiting' ? 'Offer seat' : 'Offer again'}
                  </button>
                  {sections.length > 0 && (
                    <span className="relative">
                      <button onClick={() => setMovingId(movingId === e.id ? null : e.id)}
                        disabled={busy === e.id}
                        className="text-neutral-500 hover:underline disabled:opacity-50">
                        Other section ▾
                      </button>
                      {movingId === e.id && (
                        <>
                          <span className="fixed inset-0 z-10" onClick={() => setMovingId(null)} />
                          <span className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg py-1 text-left block">
                            <span className="block px-3 py-1 text-[11px] uppercase tracking-wide text-neutral-400">
                              Sections with room
                            </span>
                            <span className="block px-3 pb-1 text-[11px] text-neutral-400 leading-snug">
                              Offer it lets the family claim the seat — they know
                              whether that time works.
                            </span>
                            {sections.map((sec) => (
                              <span key={sec.class_id} className="block px-3 py-1.5 hover:bg-neutral-50">
                                <span className="block text-xs text-neutral-700">
                                  {sec.name}
                                  <span className="text-neutral-400">
                                    {sec.capacity != null
                                      ? ` · ${Math.max(0, sec.capacity - (sec.enrolled_count || 0))} seat(s)`
                                      : ' · space available'}
                                  </span>
                                </span>
                                <span className="flex items-center gap-2 mt-0.5">
                                  <button onClick={() => offerSection(e, sec)}
                                    className="text-xs font-medium text-optio-purple hover:underline">
                                    Offer it
                                  </button>
                                  <button onClick={() => enrollInSection(e, sec)}
                                    className="text-xs text-neutral-500 hover:underline">
                                    Enroll directly
                                  </button>
                                </span>
                              </span>
                            ))}
                          </span>
                        </>
                      )}
                    </span>
                  )}
                  <button onClick={() => remove(e)} disabled={busy === e.id}
                    className="text-neutral-400 hover:text-red-500 hover:underline disabled:opacity-50">
                    Remove
                  </button>
                </span>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        <strong>Enroll now</strong> puts the student in the class immediately — use it when the school has
        already decided. <strong>Offer</strong> asks the family to claim the seat themselves, and can be
        sent again if the first offer lapsed.
      </p>
    </div>
  )
}

export default ClassWaitlist
