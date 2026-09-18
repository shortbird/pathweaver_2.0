import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { sisPeopleApi } from '../../../hooks/api/useSisPeople'
import { useConfirm } from '../../../contexts/ConfirmContext'

/**
 * The same person on two rows: a placeholder card holding the class
 * assignments plus a real account that was invited separately. Listed once
 * per pair, keyed by the placeholder that gets merged away.
 *
 * iCreate, 2026-08-01: "I messed up and invited Julia 'ADD TEACHER' instead of
 * inviting her from her card that was already created!" The merge is the
 * existing /link endpoint; what was missing was anything saying the two rows
 * were the same person.
 */
const StaffDuplicatesBanner = ({ rows, orgId, onMerged }) => {
  const confirm = useConfirm()
  const [merging, setMerging] = useState(null)
  const duplicates = rows.filter((r) => r.is_placeholder && r.duplicate_of && !r.duplicate_of.is_placeholder)
  if (!duplicates.length) return null

  const merge = async (placeholder) => {
    const real = placeholder.duplicate_of
    const classes = placeholder.class_count || 0
    const ok = await confirm(
      `Merge the "${placeholder.name}" card into ${real.email}?\n\n` +
      (classes
        ? `Their ${classes} class assignment${classes === 1 ? '' : 's'} move to that account, and the duplicate card is removed.`
        : 'The duplicate card is removed; the invited account keeps everything.'),
    )
    if (!ok) return
    setMerging(placeholder.student_id)
    try {
      await sisPeopleApi.mergePlaceholder(orgId, placeholder.student_id, real.email)
      toast.success(`${placeholder.name} is now one account`)
      onMerged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not merge the two records')
    } finally {
      setMerging(null)
    }
  }

  return duplicates.map((d) => (
    <div key={d.student_id} className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-wrap items-center gap-3">
      <p className="text-sm text-amber-900 flex-1 min-w-[16rem]">
        <span className="font-semibold">{d.name}</span> is on the list twice: a card with no
        login{d.class_count ? ` holding ${d.class_count} class${d.class_count === 1 ? '' : 'es'}` : ''},
        and an invited account ({d.duplicate_of.email}). Merging keeps the invited account and
        moves the classes onto it.
      </p>
      <button
        type="button"
        onClick={() => merge(d)}
        disabled={merging === d.student_id}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gradient-primary text-white hover:opacity-90 disabled:opacity-50"
      >
        {merging === d.student_id ? 'Merging…' : 'Merge into invited account'}
      </button>
    </div>
  ))
}

export default StaffDuplicatesBanner
