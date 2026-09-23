import React, { useEffect, useState } from 'react'
import { INPUT_CLASS } from '../../ui/Input'
import { useClassFamilies, useRecipientClasses } from '../../../hooks/api/useSisOnboarding'

/**
 * "Pick a class" above a family recipient list (ticket a19d5660).
 *
 * An iCreate admin wanted to send something to one class's parents without
 * ticking them one by one. Choosing a class asks the server for the guardians
 * of the students enrolled in it (both link tables, withdrawn enrollments
 * excluded -- the server owns that rule) and hands the list to the caller,
 * which narrows its list to them and selects them. Choosing "All families"
 * hands back null, and the caller puts its full list back.
 *
 * Shared by AssignChecklistModal and AssignComposer so the two family lists
 * cannot drift apart. The class the caller has applied lives with the caller
 * (`value`), because the composer unmounts this when you switch to the Staff
 * tab and the choice has to survive the trip back. `picked` is what the select
 * shows, which runs ahead of `value` while the class's families load.
 */
export default function ClassRecipientFilter({ orgId, value = '', onPick }) {
  const [picked, setPicked] = useState(value)
  const { data: classes = [] } = useRecipientClasses(orgId)
  const families = useClassFamilies(orgId, picked)

  // Hand the answer over once, when it is for the class on screen and the
  // caller has not applied it yet. The query key carries the class id, so a
  // slow answer for a class already moved off never arrives here as `data`.
  useEffect(() => {
    if (!picked || picked === value) return
    if (families.data) onPick(families.data, picked)
    else if (families.isError) onPick([], picked)
  }, [picked, value, families.data, families.isError, onPick])

  const pick = (id) => {
    setPicked(id)
    if (!id) onPick(null, '')
  }

  if (!classes.length) return null

  return (
    <label className="block mb-2">
      <span className="block text-xs font-medium text-neutral-500 mb-1">
        Pick a class <span className="font-normal text-neutral-400">(optional)</span>
      </span>
      <select value={picked} onChange={(e) => pick(e.target.value)}
        className={INPUT_CLASS} aria-label="Pick a class">
        <option value="">All families</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>{c.name || 'Untitled class'}</option>
        ))}
      </select>
      {picked && picked !== value && families.isFetching && (
        <span className="block text-xs text-neutral-400 mt-1">Loading families…</span>
      )}
    </label>
  )
}
