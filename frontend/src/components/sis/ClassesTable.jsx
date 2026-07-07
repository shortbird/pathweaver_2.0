import React, { useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import SearchSelect from '../ui/SearchSelect'
import { meetingsToForm, blockMinutes, blockLabel, hhmm } from './CreateClassModal'

// Spreadsheet-style view of the org's classes. Rows stay scannable — name,
// teacher, days, time, enrollment — and clicking a row expands an inline
// editor with every attribute. Edits live in a per-row draft with Save/Cancel;
// Save runs through the same write path as the card editor (PATCH + meeting
// sync). Registration open/closed toggles immediately.
//
// Props:
//   classes    hydrated org classes (with meetings, enrolled_count)
//   staff      org staff for the teacher picker
//   timeBlocks school periods — when set, times are picked per block
//   onSave     async (cls, payload) -> bool — persists a row draft
//   onToggleRegistration (cls)
//   onOpen     (cls) — open the full card editor (image, waitlist, archive, preview)

const cell = 'w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple bg-white'

const DAY_OPTS = [
  { dow: 1, label: 'M' }, { dow: 2, label: 'T' }, { dow: 3, label: 'W' },
  { dow: 4, label: 'T' }, { dow: 5, label: 'F' },
]
const DAY_LETTER = { 0: 'Su', 1: 'M', 2: 'T', 3: 'W', 4: 'Th', 5: 'F', 6: 'Sa' }

const fmt12 = (t) => {
  const [h, m] = hhmm(t).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${ampm}`
}

const daysText = (meetings = []) => {
  const dows = [...new Set(meetings.map((m) => m.day_of_week).filter((d) => d != null))].sort()
  return dows.map((d) => DAY_LETTER[d]).join(' ') || '—'
}
const timeText = (meetings = []) => {
  const first = meetings.find((m) => m.start_time && m.end_time)
  return first ? `${fmt12(first.start_time)}–${fmt12(first.end_time)}` : '—'
}

// A class's editable attributes as flat draft fields.
const toDraft = (c) => {
  const seed = meetingsToForm(c.meetings || [])
  return {
    name: c.name || '',
    description: c.description || '',
    primary_instructor_id: c.primary_instructor_id || '',
    location: c.location || '',
    days_of_week: (seed.days_of_week || []).map((code) => ({ mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 }[code])),
    start_time: seed.start_time || '',
    duration_minutes: String(seed.duration_minutes || ''),
    capacity: c.capacity != null ? String(c.capacity) : '',
    tuition: c.price_cents != null ? String(c.price_cents / 100) : '',
    supply_fee: c.supply_fee != null ? String(c.supply_fee) : '',
    min_age: c.min_age != null ? String(c.min_age) : '',
    max_age: c.max_age != null ? String(c.max_age) : '',
  }
}

const numOrUndef = (v) => (v === '' || v == null ? undefined : Number(v))

const draftToPayload = (d) => ({
  name: d.name.trim(),
  description: d.description,
  location: d.location.trim() || null,
  primary_instructor_id: d.primary_instructor_id || null,
  days_of_week: d.days_of_week,
  start_time: d.start_time || undefined,
  duration_minutes: numOrUndef(d.duration_minutes),
  capacity: numOrUndef(d.capacity),
  price_cents: d.tuition === '' ? null : Math.round(Number(d.tuition) * 100),
  supply_fee: numOrUndef(d.supply_fee),
  min_age: numOrUndef(d.min_age),
  max_age: numOrUndef(d.max_age),
})

const Field = ({ label, children, className = '' }) => (
  <div className={className}>
    <label className="block text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1">{label}</label>
    {children}
  </div>
)

const ClassesTable = ({ classes, staff, timeBlocks = [], onSave, onToggleRegistration, onOpen }) => {
  const [drafts, setDrafts] = useState({})   // class_id -> draft (kept when collapsed)
  const [expandedId, setExpandedId] = useState(null)
  const [saving, setSaving] = useState(null) // class_id mid-save

  const pickable = timeBlocks.filter((b) => !b.label)

  const edit = (c, patch) => setDrafts((ds) => ({
    ...ds,
    [c.id]: { ...(ds[c.id] || toDraft(c)), ...patch },
  }))
  const cancel = (id) => setDrafts(({ [id]: _, ...rest }) => rest)

  const save = async (c) => {
    const d = drafts[c.id]
    if (!d || !d.name.trim()) return
    setSaving(c.id)
    try {
      const ok = await onSave(c, draftToPayload(d))
      if (ok) cancel(c.id)
    } finally { setSaving(null) }
  }

  const blockValue = (d) => {
    const i = pickable.findIndex((b) => hhmm(b.start) === d.start_time && String(blockMinutes(b)) === String(d.duration_minutes))
    return i >= 0 ? String(i) : ''
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-400 border-b border-gray-100">
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5">Teacher</th>
            <th className="px-4 py-2.5">Days</th>
            <th className="px-4 py-2.5">Time</th>
            <th className="px-4 py-2.5">Enrolled</th>
            <th className="px-4 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => {
            const open = expandedId === c.id
            const d = drafts[c.id] || toDraft(c)
            const dirty = !!drafts[c.id]
            const busy = saving === c.id
            const isOpen = c.registration_status === 'open'
            return (
              <React.Fragment key={c.id}>
                <tr
                  onClick={() => setExpandedId(open ? null : c.id)}
                  className={`border-b border-gray-50 cursor-pointer transition-colors ${open ? 'bg-optio-purple/[0.04]' : 'hover:bg-neutral-50'}`}>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {c.name}
                    {dirty && <span className="ml-2 text-[10px] font-semibold text-optio-purple uppercase">edited</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{c.primary_instructor?.name || c.primary_instructor?.display_name || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{daysText(c.meetings)}</td>
                  <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{timeText(c.meetings)}</td>
                  <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">
                    {c.enrolled_count ?? 0}{c.capacity != null ? `/${c.capacity}` : ''}
                    {c.is_full && <span className="ml-1.5 text-[10px] font-semibold text-red-500">FULL</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ChevronDownIcon className={`w-4 h-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-gray-100 bg-optio-purple/[0.02]">
                    <td colSpan={6} className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
                        <Field label="Name" className="col-span-2">
                          <input className={cell} value={d.name} onChange={(e) => edit(c, { name: e.target.value })} />
                        </Field>
                        <Field label="Teacher" className="col-span-2">
                          <SearchSelect
                            value={d.primary_instructor_id}
                            onChange={(id) => edit(c, { primary_instructor_id: id })}
                            options={staff}
                            getId={(s) => s.id}
                            getLabel={(s) => s.name}
                            placeholder="Search staff…"
                          />
                        </Field>
                        <Field label="Days">
                          <div className="inline-flex gap-1">
                            {DAY_OPTS.map((day, i) => {
                              const selected = d.days_of_week.includes(day.dow)
                              return (
                                <button key={i} type="button" aria-pressed={selected}
                                  onClick={() => edit(c, {
                                    days_of_week: selected
                                      ? d.days_of_week.filter((x) => x !== day.dow)
                                      : [...d.days_of_week, day.dow],
                                  })}
                                  className={`w-7 h-7 rounded text-xs font-semibold border transition-colors ${
                                    selected
                                      ? 'bg-optio-purple text-white border-transparent'
                                      : 'bg-white text-neutral-400 border-gray-200 hover:border-optio-purple'
                                  }`}>
                                  {day.label}
                                </button>
                              )
                            })}
                          </div>
                        </Field>
                        <Field label="Time">
                          {pickable.length ? (
                            <select className={cell} value={blockValue(d)}
                              onChange={(e) => {
                                const b = pickable[Number(e.target.value)]
                                if (b) edit(c, { start_time: hhmm(b.start), duration_minutes: String(blockMinutes(b)) })
                              }}>
                              <option value="" disabled>
                                {d.start_time ? `${d.start_time} · ${d.duration_minutes || '?'} min` : 'Pick a block'}
                              </option>
                              {pickable.map((b, i) => <option key={i} value={String(i)}>{blockLabel(b)}</option>)}
                            </select>
                          ) : (
                            <div className="flex gap-1.5">
                              <input type="time" className={cell} value={d.start_time}
                                onChange={(e) => edit(c, { start_time: e.target.value })} />
                              <input type="number" className={`${cell} w-20`} min={5} step={5} placeholder="min"
                                aria-label="Duration (minutes)" value={d.duration_minutes}
                                onChange={(e) => edit(c, { duration_minutes: e.target.value })} />
                            </div>
                          )}
                        </Field>
                        <Field label="Classroom">
                          <input className={cell} placeholder="Room" value={d.location}
                            onChange={(e) => edit(c, { location: e.target.value })} />
                        </Field>
                        <Field label="Capacity">
                          <input type="number" min={1} className={cell} placeholder="Unlimited" value={d.capacity}
                            aria-label="Capacity" onChange={(e) => edit(c, { capacity: e.target.value })} />
                        </Field>
                        <Field label="Tuition">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">$</span>
                            <input type="number" min={0} step="0.01" className={`${cell} pl-5`} value={d.tuition}
                              aria-label="Tuition" onChange={(e) => edit(c, { tuition: e.target.value })} />
                          </div>
                        </Field>
                        <Field label="Supply fee">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">$</span>
                            <input type="number" min={0} step="0.01" className={`${cell} pl-5`} value={d.supply_fee}
                              aria-label="Supply fee" onChange={(e) => edit(c, { supply_fee: e.target.value })} />
                          </div>
                        </Field>
                        <Field label="Ages">
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} className={cell} placeholder="Min" value={d.min_age}
                              aria-label="Minimum age" onChange={(e) => edit(c, { min_age: e.target.value })} />
                            <span className="text-neutral-300">–</span>
                            <input type="number" min={0} className={cell} placeholder="Max" value={d.max_age}
                              aria-label="Maximum age" onChange={(e) => edit(c, { max_age: e.target.value })} />
                          </div>
                        </Field>
                        <Field label="Registration">
                          <button
                            type="button" role="switch" aria-checked={isOpen}
                            aria-label={`Toggle registration for ${c.name}`}
                            onClick={() => onToggleRegistration(c)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isOpen ? 'bg-green-500' : 'bg-neutral-300'}`}>
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isOpen ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </button>
                          <span className="ml-2 text-xs text-neutral-500 align-middle">{isOpen ? 'Open' : 'Closed'}</span>
                        </Field>
                        <Field label="Description" className="col-span-2 md:col-span-4">
                          <textarea rows={2} className={`${cell} resize-y`} value={d.description}
                            onChange={(e) => edit(c, { description: e.target.value })} />
                        </Field>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <button onClick={() => onOpen(c)} className="text-sm text-optio-purple hover:underline">
                          Open full editor (image, waitlist, archive, preview)
                        </button>
                        <div className="flex items-center gap-3">
                          {dirty && (
                            <button onClick={() => cancel(c.id)} disabled={busy}
                              className="text-sm text-neutral-500 hover:underline disabled:opacity-50">Cancel</button>
                          )}
                          <button onClick={() => save(c)} disabled={busy || !dirty || !d.name.trim()}
                            className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90 disabled:opacity-50">
                            {busy ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      {classes.length === 0 && (
        <p className="p-6 text-sm text-neutral-400">No classes yet.</p>
      )}
    </div>
  )
}

export default ClassesTable
