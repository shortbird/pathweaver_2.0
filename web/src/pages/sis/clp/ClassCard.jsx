// One class in the CLP lists: what it is, when it meets, what it costs, and
// the single action that applies right now -- enroll, drop, join or leave the
// waitlist. The action is a function of the class's own state, not a menu.
import React from 'react'
import Button from '../../../components/ui/Button'
import { Pill, SeatsPill, meetingSummary, priceLabel, dollars } from './clpHelpers'

const ClassActions = ({ cls, busyId, drop, enroll, joinWaitlist, leaveWaitlist }) => {
  const busy = busyId === cls.class_id
  if (cls.is_enrolled) {
    return <Button size="sm" variant="outline" disabled={busy} onClick={() => drop(cls)}>{busy ? '…' : 'Drop'}</Button>
  }
  if (cls.on_waitlist) {
    return (
      <div className="flex items-center gap-2">
        <Pill className="bg-amber-100 text-amber-700">Waitlisted{cls.waitlist_position ? ` #${cls.waitlist_position}` : ''}</Pill>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => leaveWaitlist(cls)}>{busy ? '…' : 'Leave'}</Button>
      </div>
    )
  }
  if (cls.is_full) {
    return <Button size="sm" variant="outline" disabled={busy} onClick={() => joinWaitlist(cls)}>{busy ? '…' : 'Join waitlist'}</Button>
  }
  return <Button size="sm" disabled={busy} onClick={() => enroll(cls)}>{busy ? '…' : 'Enroll'}</Button>
}

const ClassCard = ({ cls, busyId, drop, enroll, joinWaitlist, leaveWaitlist }) => (
  <div key={cls.class_id} className="rounded-xl border border-gray-200 bg-white p-3 flex items-start justify-between gap-3">
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-neutral-900 truncate">{cls.name}</span>
        {cls.conflicts && <Pill className="bg-rose-100 text-rose-700">Time conflict</Pill>}
        {cls.registration_status === 'closed' && <Pill className="bg-neutral-100 text-neutral-500">Registration closed</Pill>}
      </div>
      <div className="text-sm text-neutral-500 mt-0.5">{meetingSummary(cls.meetings)}</div>
      <div className="flex items-center gap-2 flex-wrap mt-1.5">
        {cls.primary_instructor?.name && <span className="text-xs text-neutral-500">{cls.primary_instructor.name}</span>}
        <SeatsPill cls={cls} />
        {cls.waitlist_count > 0 && <Pill className="bg-amber-100 text-amber-700">{cls.waitlist_count} waiting</Pill>}
        {priceLabel(cls.price_cents) && <span className="text-xs text-neutral-500">{priceLabel(cls.price_cents)}</span>}
        {Number(cls.supply_fee) > 0 && <span className="text-xs text-neutral-500">{dollars(cls.supply_fee)} supplies</span>}
      </div>
    </div>
    <div className="flex-shrink-0">{<ClassActions {...{ cls, busyId, drop, enroll, joinWaitlist, leaveWaitlist }} />}</div>
  </div>
)

export default ClassCard
