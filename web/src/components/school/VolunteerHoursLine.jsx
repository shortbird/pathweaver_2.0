import React from 'react'

/**
 * "Volunteer hours: 12.5 as of <date>", and staff's note under it, for this
 * family alone. iCreate 01082b30: "Could we make a way for parents to be able
 * to see how many volunteer hours they have completed? ... keep it private so
 * not everyone sees everyone elses." The school keeps the number; the family
 * only reads it (hooks/api/useFamilyVolunteerHours).
 *
 * Drawn under the school letterhead on every school tab (pages/school/
 * SchoolShell) and on the family home (pages/home/FamilyHome), where parents
 * actually land -- iCreate 2fab910a/9db5bde3: "I'm not seeing it from the
 * parent side." `align` is 'center' under the letterhead, 'start' on the home.
 * `label` names the school when a family has more than one.
 */
export default function VolunteerHoursLine({ hours, updatedAt, note, align = 'center', label = 'Volunteer hours', className = 'mt-4' }) {
  const value = Number(hours || 0)
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')
  const updated = updatedAt ? new Date(updatedAt).toLocaleDateString() : null
  const start = align === 'start'
  return (
    <div className={`${className} flex flex-col ${start ? 'items-start' : 'items-center'}`}>
      <div className="inline-flex items-baseline gap-2 rounded-full border border-optio-purple/20 bg-optio-purple/5 px-4 py-1.5"
        data-testid="family-volunteer-hours">
        <span className="text-sm text-neutral-600">{label}</span>
        <span className="text-sm font-semibold text-optio-purple">{shown}</span>
        {updated && <span className="text-xs text-neutral-400">as of {updated}</span>}
      </div>
      {/* iCreate b98a167f: staff's note under the hours ("a little message
          with dates"); drawn only when there is one. */}
      {note && (
        <p className={`mt-2 max-w-md whitespace-pre-line text-xs text-neutral-600 ${start ? 'text-left' : 'text-center'}`}
          data-testid="family-volunteer-hours-note">{note}</p>
      )}
    </div>
  )
}
