import React, { useState, useMemo } from 'react'
import { ChevronDownIcon, ChevronUpDownIcon } from '@heroicons/react/24/outline'
import ClassFieldsEditor from './ClassFieldsEditor'
import { toDraft, draftToPayload, meetingsToForm, hhmm, fmt12ap, DAY_LETTER } from './classFields'

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

const daysText = (meetings = []) => {
  const dows = [...new Set(meetings.map((m) => m.day_of_week).filter((d) => d != null))].sort()
  return dows.map((d) => DAY_LETTER[d]).join(' ') || '—'
}
const timeText = (meetings = []) => {
  const first = meetings.find((m) => m.start_time && m.end_time)
  return first ? `${fmt12ap(first.start_time)}–${fmt12ap(first.end_time)}` : '—'
}
const agesText = (c) => {
  if (c.min_age != null && c.max_age != null) return `${c.min_age}\u2013${c.max_age}`
  if (c.min_age != null) return `${c.min_age}+`
  if (c.max_age != null) return `Up to ${c.max_age}`
  return '—'
}

const teacherName = (c) => c.primary_instructor?.name || c.primary_instructor?.display_name || ''
// Sort keys -> a comparable value for a class row. Missing values sort last.
const SORT_VALUE = {
  name: (c) => (c.name || '').toLowerCase(),
  teacher: (c) => teacherName(c).toLowerCase(),
  days: (c) => {
    const dows = (c.meetings || []).map((m) => m.day_of_week).filter((d) => d != null)
    return dows.length ? Math.min(...dows) : 99
  },
  time: (c) => {
    const first = (c.meetings || []).find((m) => m.start_time)
    return first ? hhmm(first.start_time) : '99:99'
  },
  room: (c) => (c.location || '\uffff').toLowerCase(),   // unassigned rooms sort last
  ages: (c) => (c.min_age != null ? c.min_age : 999),
  enrolled: (c) => c.enrolled_count ?? 0,
  waitlist: (c) => c.waitlist_count ?? 0,
}

const SORT_LABELS = {
  name: 'Name', teacher: 'Teacher', days: 'Days', time: 'Time',
  room: 'Room', ages: 'Ages', enrolled: 'Enrolled', waitlist: 'Waitlist',
}

// Multi-level sort: `sort` is an ordered list of {key, dir}. Index 0 is the
// primary sort; each further click on a new column adds a deeper tiebreaker, so
// you can freeze one column and keep sorting within it (day, then time, …).
const SortHeader = ({ label, sortKey, sort, onSort, className = '' }) => {
  const idx = sort.findIndex((s) => s.key === sortKey)
  const active = idx !== -1
  const entry = active ? sort[idx] : null
  return (
    <th className={`px-4 py-2.5 ${className}`}>
      <button type="button" onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-neutral-600 ${active ? 'text-optio-purple' : ''}`}>
        {label}
        {active
          ? <>
              <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${entry.dir === 'asc' ? 'rotate-180' : ''}`} />
              {sort.length > 1 && <span className="text-[10px] font-bold">{idx + 1}</span>}
            </>
          : <ChevronUpDownIcon className="w-3.5 h-3.5 text-neutral-300" />}
      </button>
    </th>
  )
}

const ClassesTable = ({ classes, staff, timeBlocks = [], rooms = [], onSave, onToggleRegistration, onOpen, onDuplicate, onRoster, onArchive, onRestore, onOfferSeat }) => {
  const [drafts, setDrafts] = useState({})   // class_id -> draft (kept when collapsed)
  // Picked-but-not-yet-uploaded images, by class. The file rides along with the
  // Save (the upload needs the class id, so it can't happen on pick), and the
  // object URL is revoked when the row is saved or cancelled.
  const [imageFiles, setImageFiles] = useState({})
  const [imagePreviews, setImagePreviews] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [saving, setSaving] = useState(null) // class_id mid-save
  const [offering, setOffering] = useState(null) // class_id mid seat-offer
  const [sort, setSort] = useState([]) // ordered [{ key, dir }] — index 0 is primary

  // Click cycles a column asc -> desc -> off. A column not yet in the sort is
  // appended as the next-deeper tiebreaker, so clicking Day then Time sorts by
  // day and then by time within each day.
  const onSort = (key) => setSort((stack) => {
    const i = stack.findIndex((s) => s.key === key)
    if (i === -1) return [...stack, { key, dir: 'asc' }]
    if (stack[i].dir === 'asc') {
      const next = [...stack]
      next[i] = { key, dir: 'desc' }
      return next
    }
    return stack.filter((s) => s.key !== key)
  })

  const sortedClasses = useMemo(() => {
    if (!sort.length) return classes
    return [...classes].sort((a, b) => {
      for (const { key, dir } of sort) {
        const val = SORT_VALUE[key]
        const va = val(a), vb = val(b)
        if (va < vb) return dir === 'asc' ? -1 : 1
        if (va > vb) return dir === 'asc' ? 1 : -1
      }
      return 0
    })
  }, [classes, sort])

  const pickable = timeBlocks.filter((b) => !b.label)

  const edit = (c, patch) => setDrafts((ds) => ({
    ...ds,
    [c.id]: { ...(ds[c.id] || toDraft(c)), ...patch },
  }))
  const pickImage = (c, file) => {
    setImageFiles((f) => ({ ...f, [c.id]: file }))
    setImagePreviews((p) => {
      if (p[c.id]) URL.revokeObjectURL(p[c.id])
      return { ...p, [c.id]: URL.createObjectURL(file) }
    })
    // Selecting an image makes the row dirty so Save lights up for it.
    edit(c, {})
  }

  const clearImage = (c) => {
    setImageFiles(({ [c.id]: _f, ...rest }) => rest)
    setImagePreviews(({ [c.id]: url, ...rest }) => {
      if (url && url !== c.image_url) URL.revokeObjectURL(url)
      return rest
    })
  }

  const cancel = (id) => {
    setDrafts(({ [id]: _, ...rest }) => rest)
    setImageFiles(({ [id]: _f, ...rest }) => rest)
    setImagePreviews(({ [id]: url, ...rest }) => {
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      return rest
    })
  }

  const save = async (c) => {
    const d = drafts[c.id]
    if (!d || !d.name.trim()) return
    setSaving(c.id)
    try {
      const ok = await onSave(c, draftToPayload(d), imageFiles[c.id] || null)
      if (ok) cancel(c.id)
    } finally { setSaving(null) }
  }

  const offerSeat = async (c) => {
    setOffering(c.id)
    try { await onOfferSeat(c) } finally { setOffering(null) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      {sort.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs text-neutral-500 border-b border-gray-100">
          <span>
            Sorted by {sort.map((s, i) => `${sort.length > 1 ? `${i + 1}. ` : ''}${SORT_LABELS[s.key]}${s.dir === 'desc' ? ' ↓' : ' ↑'}`).join(', ')}
          </span>
          <button type="button" onClick={() => setSort([])} className="text-optio-purple hover:underline">Clear</button>
          <span className="text-neutral-300 hidden sm:inline">· Click a column to add a deeper level; click again to flip or remove it.</span>
        </div>
      )}
      <table className="w-full text-sm min-w-[780px]">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-400 border-b border-gray-100">
            <SortHeader label="Name" sortKey="name" sort={sort} onSort={onSort} />
            <SortHeader label="Teacher" sortKey="teacher" sort={sort} onSort={onSort} />
            <SortHeader label="Days" sortKey="days" sort={sort} onSort={onSort} />
            <SortHeader label="Time" sortKey="time" sort={sort} onSort={onSort} />
            {/* Assigning rooms meant opening every class in turn to see which
                room it already had (iCreate, 2026-09-02). */}
            <SortHeader label="Room" sortKey="room" sort={sort} onSort={onSort} />
            <SortHeader label="Ages" sortKey="ages" sort={sort} onSort={onSort} />
            <SortHeader label="Enrolled" sortKey="enrolled" sort={sort} onSort={onSort} />
            <SortHeader label="Waitlist" sortKey="waitlist" sort={sort} onSort={onSort} />
            <th className="px-4 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {sortedClasses.map((c) => {
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
                    {c.status === 'archived' && <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-600 rounded uppercase">Archived</span>}
                    {!isOpen && c.status !== 'archived' && <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded uppercase" title="Closed to registration — families can't see this class in the Schedule Builder">Closed</span>}
                    {c.is_visible_to_parents === false && <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 text-optio-purple rounded uppercase" title="Hidden from parents — staff only">Hidden from parents</span>}
                    {dirty && <span className="ml-2 text-[10px] font-semibold text-optio-purple uppercase">edited</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {c.primary_instructor?.name || c.primary_instructor?.display_name || '—'}
                    {/* Staff always see the assistant. Say when families don't,
                        so "why isn't Julia on the catalog?" answers itself. */}
                    {c.assistant_instructors?.length > 0 && (
                      <span className="block text-xs text-neutral-400">
                        + {c.assistant_instructors.map((a) => a.name).join(', ')}
                        {c.show_assistants === false && (
                          <span className="ml-1 text-neutral-400"
                            title="Families don't see the assistant on this class — change it in Edit class">
                            (hidden from families)
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{daysText(c.meetings)}</td>
                  <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{timeText(c.meetings)}</td>
                  <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">
                    {c.location || <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">{agesText(c)}</td>
                  <td className="px-4 py-3 text-neutral-600 whitespace-nowrap">
                    {c.enrolled_count ?? 0}{c.capacity != null ? `/${c.capacity}` : ''}
                    {c.is_full && <span className="ml-1.5 text-[10px] font-semibold text-red-500">FULL</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {/* The count is the whole live queue; the parenthetical says
                          how much of it is already spoken for, so the number and
                          the button can't disagree. */}
                      {c.waitlist_count > 0
                        ? (
                          <span className="text-amber-700 font-medium">
                            {c.waitlist_count}
                            {c.waitlist_offered > 0 && (
                              <span className="ml-1 text-[11px] font-normal text-neutral-400">
                                {c.waitlist_offered === c.waitlist_count
                                  ? 'offered'
                                  : `· ${c.waitlist_offered} offered`}
                              </span>
                            )}
                          </span>
                        )
                        : <span className="text-neutral-300">—</span>}
                      {/* Offer the open seat to the next WAITING student right here.
                          Only when a seat is actually open (not full) and someone is
                          waiting — offering into a full class over-enrolls, and a
                          queue that is entirely 'offered' has nobody left to offer
                          to (which read as a bug: "it says offer next seat ... but
                          it says no one is waiting"). Those go through the Waitlist
                          tab, where the entries can be re-offered or enrolled. */}
                      {onOfferSeat && (c.waitlist_waiting ?? c.waitlist_count) > 0 && !c.is_full && c.status !== 'archived' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); offerSeat(c) }}
                          disabled={offering === c.id}
                          title="Offer the open seat to the next student on the waitlist"
                          className="text-[11px] font-semibold px-2 py-1 rounded-md border border-optio-purple/40 text-optio-purple hover:bg-optio-purple/5 disabled:opacity-50 transition-colors">
                          {offering === c.id ? '…' : 'Offer next seat'}
                        </button>
                      )}
                      {/* On the row, not only at the foot of the expanded
                          editor. Clicking a class opens the days-and-times form,
                          so somebody looking for the roster expanded a class,
                          saw a schedule editor and concluded there was nowhere
                          to add a student (Gryffin, 2026-08-27: "when i click on
                          the class it just does a drop down of like days and
                          times ... I am not sure where to find the option to add
                          a student"). */}
                      {onRoster && c.status !== 'archived' && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onRoster(c) }}
                          title="Open the roster to add or drop students"
                          className="text-[11px] font-semibold px-2 py-1 rounded-md border border-gray-300 text-neutral-600 hover:bg-gray-50 transition-colors">
                          Roster
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronDownIcon className={`w-4 h-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-gray-100 bg-optio-purple/[0.02]">
                    <td colSpan={9} className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <ClassFieldsEditor
                        draft={d}
                        onChange={(patch) => edit(c, patch)}
                        staff={staff}
                        timeBlocks={timeBlocks}
                        rooms={rooms}
                        imagePreview={imagePreviews[c.id] ?? c.image_url ?? null}
                        onImageChange={(file) => pickImage(c, file)}
                        onImageRemove={() => clearImage(c)}
                        headerAside={(
                          /* On the heading line, not a bar of its own. It still
                             says "saves now", because it is the one control here
                             that writes without pressing Save. */
                          <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                            <span className="text-[11px] text-neutral-400 uppercase tracking-wide">
                              Registration{' '}
                              <span className={isOpen ? 'text-green-600 font-semibold' : 'text-neutral-500 font-semibold'}>
                                {isOpen ? 'open' : 'closed'}
                              </span>
                              <span className="normal-case tracking-normal"> · saves now</span>
                            </span>
                            <button
                              type="button" role="switch" aria-checked={isOpen}
                              aria-label={`Toggle registration for ${c.name}`}
                              onClick={() => onToggleRegistration(c)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isOpen ? 'bg-green-500' : 'bg-neutral-300'}`}>
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isOpen ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                          </label>
                        )}
                      />

                      {/* Pinned to the left edge of the scroll box, not spread
                          across a table that is now wider than the screen.
                          Adding the Room column pushed a justify-between Save
                          off the right-hand side, and it could only be reached
                          by scrolling sideways (iCreate, 2026-09-02: "I can't
                          see the SAVE button when I edit"). */}
                      <div className="sticky left-0 z-10 flex w-max items-center gap-8 mt-3">
                        <div className="flex items-center gap-4">
                          {/* One link, not two. "View roster" and "Full editor"
                              now go to the same place: every field is editable
                              right here, so the modal is only worth what it
                              uniquely has — the roster, the waitlist and the
                              parent preview. "Full editor" also implied this
                              editor was the partial one, which was the whole
                              complaint. */}
                          <button onClick={() => (onRoster ? onRoster(c) : onOpen(c))}
                            className="text-sm text-optio-purple hover:underline">
                            Roster &amp; waitlist
                          </button>
                          {onDuplicate && (
                            <button onClick={() => onDuplicate(c)} className="text-sm text-neutral-500 hover:text-optio-purple hover:underline">
                              Duplicate
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Archive is destructive and sat inline with three
                              navigations. It lives on the far side now, away
                              from anything you click routinely. */}
                          {c.status === 'archived'
                            ? onRestore && (
                              <button onClick={() => onRestore(c)} className="text-sm font-medium text-optio-purple hover:underline">
                                Restore class
                              </button>
                            )
                            : onArchive && (
                              <button onClick={() => onArchive(c)} className="text-sm text-red-500 hover:underline mr-2">
                                Archive
                              </button>
                            )}
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
