import React from 'react'

/**
 * Going home: everyone on site that day, in the order they go home, with the
 * ones leaving before the end of the day in amber.
 *
 * "Can we get a way to know who is leaving halfdays, etc." (iCreate,
 * 2026-08-26 -- 1fc5012b). Derived from each child's last class of the day:
 * nothing records a half day, and a second thing to type in would only go
 * stale. The list comes from the backend (`departures` on a day of the day
 * rosters or the block rosters), so both reports read one answer.
 *
 * Shared since ticket 31e93fbb (Katrine, iCreate, 2026-09-24): "Is there a way
 * we can have that be at the top of the block rosters, too?" The block rosters
 * open it (`defaultOpen`) because that sheet gets printed, and a closed
 * <details> prints as its one-line summary.
 */
const GoingHome = ({ departures, defaultOpen = false }) => {
  if (!(departures || []).length) return null
  const early = departures.filter((x) => x.early).length
  return (
    <details open={defaultOpen || undefined} data-going-home
      className="mb-4 border border-gray-200 rounded-lg">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-neutral-800">
        Going home{' '}
        <span className="font-normal text-neutral-500">
          · {early} before the end of the day
        </span>
      </summary>
      <ul className="px-3 pb-3 text-sm columns-1 sm:columns-2 gap-4">
        {departures.map((x) => (
          <li key={x.name} className="break-inside-avoid flex items-baseline gap-2">
            <span className={x.early ? 'font-medium text-amber-700' : 'text-neutral-800'}>
              {x.name}
            </span>
            <span className="text-xs text-neutral-500">{x.leaves_at}</span>
            {x.family && <span className="text-xs text-neutral-400">{x.family}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * "Leaving after this block: Ada Lovelace (11:30am)" under a block's heading.
 * Only the early leavers: the last block's list is everyone who stays to the
 * end, which is the whole school and not something to go looking for.
 */
export const LeavingAfterBlock = ({ leaving }) => {
  const early = (leaving || []).filter((x) => x.early)
  if (!early.length) return null
  return (
    <p data-leaving-after-block
      className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 break-inside-avoid">
      <span className="font-semibold">Leaving after this block:</span>{' '}
      {early.map((x) => `${x.name} (${x.leaves_at})`).join(', ')}
    </p>
  )
}

export default GoingHome
