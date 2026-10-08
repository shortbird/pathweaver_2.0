import React, { useId, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

/**
 * A "More options" disclosure for the quest editor (docs/MICROSCHOOL_FIRST_PLAN.md,
 * part 4: "Projects are simpler to build"). A five-task quest took about 50
 * controls; the essentials stay in view and the rest sits behind one of these.
 *
 * Nothing saved may be hidden silently, so a closed toggle shows `summary` --
 * a short line of what the hidden fields hold (e.g. "Due Oct 12 · Counts
 * toward Science") -- and a caller whose hidden fields hold something unusual
 * may pass `defaultOpen` to start it open.
 *
 * `label` is the accessible name's tail ("for task 2"), so several toggles on
 * one screen stay tellable apart to a screen reader while all reading
 * "More options" on screen.
 */
export default function MoreOptions({ label = '', summary = '', defaultOpen = false, children, className = '' }) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button type="button" onClick={() => setOpen((o) => !o)}
          aria-expanded={open} aria-controls={panelId}
          aria-label={label ? `More options ${label}` : undefined}
          className="inline-flex items-center gap-1 rounded text-sm font-medium text-optio-purple hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-optio-purple/40">
          <Chevron className="w-4 h-4" aria-hidden="true" />
          More options
        </button>
        {!open && summary && (
          <span className="text-xs text-neutral-500" data-testid="more-options-summary">{summary}</span>
        )}
      </div>
      {open && (
        <div id={panelId} className="mt-2 space-y-2">
          {children}
        </div>
      )}
    </div>
  )
}
