import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { readTimeBlocks, saveTimeBlocks } from '../../hooks/api/useSisSettings'
import { INLINE_INPUT_CLASS } from '../ui/Input'

const field = INLINE_INPUT_CLASS
/**
 * Class time blocks — the school day's standard periods (e.g. 9:30–10:30,
 * 12:30–1:00 lunch). Rows in sis_time_blocks with ids since M8b (2026-09-18);
 * they were a JSON list in feature_flags.sis_settings before, and every
 * roster named a block by its position, so inserting one renumbered them
 * all. Read from /api/sis/schedule-settings (the same read the class editor
 * and the weekly grids use); saved through PATCH /api/sis/settings, which
 * writes the rows -- an edited block keeps its id, so the meetings that fill
 * it keep saying so. Blocks are a scheduling convention, not a constraint:
 * the class editor offers them as one-click picks (custom times still
 * allowed) and the weekly grids draw their boundaries.
 */
const TimeBlocksCard = ({ orgId, onUpdate }) => {
  const [blocks, setBlocks] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    readTimeBlocks(orgId)
      .then((rows) => { if (active) setBlocks(rows) })
      .catch(() => { if (active) setBlocks([]) })
    return () => { active = false }
  }, [orgId])

  const setBlock = (i, patch) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)))

  const save = async () => {
    const cleaned = (blocks || [])
      .filter((b) => b.start && b.end)
      .map((b) => ({ id: b.id || undefined, start: b.start, end: b.end, label: (b.label || '').trim() }))
      .sort((a, b) => a.start.localeCompare(b.start))
    for (const b of cleaned) {
      if (b.end <= b.start) return toast.error(`A block can't end before it starts (${b.start}–${b.end})`)
    }
    setSaving(true)
    try {
      const rows = await saveTimeBlocks(orgId, cleaned.length ? cleaned : null)
      setBlocks(rows)
      toast.success('Time blocks saved')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-neutral-900">Class time blocks</h2>
        <button onClick={() => setBlocks((bs) => [...(bs || []), { start: '', end: '', label: '' }])}
          className="text-sm font-medium text-optio-purple hover:underline">+ Add block</button>
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        The standard periods of your school day. They appear as one-click picks when scheduling a
        class and as guides on the weekly calendar. Label breaks like "Lunch". Custom class times
        are still allowed.
      </p>
      {blocks === null && <p className="text-sm text-neutral-400 mb-3">Loading…</p>}
      {blocks?.length === 0 && <p className="text-sm text-neutral-400 mb-3">No time blocks yet.</p>}
      <div className="space-y-2 mb-4">
        {(blocks || []).map((b, i) => (
          <div key={b.id || `new-${i}`} className="flex flex-wrap items-center gap-2">
            <input type="time" className={field} value={b.start || ''} aria-label="Block start"
              onChange={(e) => setBlock(i, { start: e.target.value })} />
            <span className="text-neutral-400 text-sm">to</span>
            <input type="time" className={field} value={b.end || ''} aria-label="Block end"
              onChange={(e) => setBlock(i, { end: e.target.value })} />
            <input className={`${field} flex-1 min-w-[120px]`} placeholder="Label (optional, e.g. Lunch)"
              value={b.label || ''} onChange={(e) => setBlock(i, { label: e.target.value })} />
            <button onClick={() => setBlocks((bs) => bs.filter((_, j) => j !== i))}
              className="text-red-500 text-sm px-1 hover:underline">Remove</button>
          </div>
        ))}
      </div>
      <button onClick={save} disabled={saving || blocks === null}
        className="px-5 py-2 rounded-lg bg-gradient-primary text-white font-medium hover:opacity-90 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save time blocks'}
      </button>
    </div>
  )
}

export default TimeBlocksCard
