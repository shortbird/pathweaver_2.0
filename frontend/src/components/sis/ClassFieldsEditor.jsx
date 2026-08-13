import React from 'react'
import { PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline'
import SearchSelect from '../ui/SearchSelect'
import {
  DAY_OPTIONS, hhmm, fmt12ap, blockMinutes, blockEndOptions, addMin, minutesBetween,
} from './classFields'

/**
 * Every editable attribute of a class, in one grid.
 *
 * There used to be two of these — the inline row editor and the modal's "full
 * editor" — differing by exactly two fields (the image and the supply budget)
 * and by which bugs they had. iCreate, 2026-08-06: "I don't like the format of
 * the expanded inline editor... maybe remove the need for the full editor?"
 *
 * Grouped into three bands because the old grid ran the fields together in
 * source order, so Days sat next to Tuition sat next to Registration and you
 * had to read every label to find anything:
 *
 *   Basics      what the class IS — name, teacher, assistants, description, image
 *   Schedule    when and where it meets
 *   Enrollment  who can take it and what it costs
 *
 * Registration is deliberately NOT here. It is a publish state, not an
 * attribute: it saves immediately while everything else is a draft, and putting
 * a live switch among the money fields invites publishing a class by accident.
 * Hosts render it beside the class, where it acts.
 */

// py-2 so a plain input is the same height as a SearchSelect (which sets its
// own padding) and as the image tile. Packing the fields four-across made the
// old 34px-vs-38px mismatch visible on every row.
const cell = 'w-full rounded-md border border-gray-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple bg-white'

// A column stretches to its row's height, so a tall neighbour (the description)
// pulls the short one (the image tile) up to match instead of leaving a gap.
const Field = ({ label, children, className = '' }) => (
  <div className={`flex flex-col min-w-0 ${className}`}>
    <label className="block text-[11px] font-medium text-neutral-400 uppercase tracking-wide mb-1">{label}</label>
    <div className="flex-1 flex flex-col">{children}</div>
  </div>
)

// Column counts by width, not one fixed grid: four-across is unreadable on a
// laptop-narrow console and impossible on a tablet, which is what the office
// actually uses. One field per row on a phone, two from `sm`, the full band
// from `lg`.
const BAND_COLS = {
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
}

// `aside` rides on the heading line rather than taking a row of its own — the
// registration switch was a full-width bar holding one toggle.
const Band = ({ title, cols = 4, aside = null, children }) => (
  <section>
    <div className="flex items-center gap-3 mb-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 shrink-0">{title}</h4>
      <span className="h-px flex-1 bg-gray-100" />
      {aside}
    </div>
    <div className={`grid ${BAND_COLS[cols]} gap-x-3 gap-y-2.5`}>{children}</div>
  </section>
)

const Money = ({ value, onChange, label, placeholder }) => (
  <div className="relative">
    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">$</span>
    <input type="number" min={0} step="0.01" className={`${cell} pl-5`} value={value}
      aria-label={label} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  </div>
)

export default function ClassFieldsEditor({
  draft: d,
  onChange,
  staff = [],
  timeBlocks = [],
  rooms = [],
  // Image editing needs a file and a class id to upload against, so the host
  // owns it; passing null leaves the tile out entirely.
  imagePreview = null,
  onImageChange = null,
  onImageRemove = null,
  namePlaceholder = 'e.g. Intro to Robotics',
  // Rendered on the Basics heading line. The row editor puts the registration
  // switch here: it is a publish state that saves the moment you flip it, so it
  // does not belong among the draft fields — but it also does not deserve a
  // full-width bar of its own to hold one toggle.
  headerAside = null,
}) {
  const set = (patch) => onChange(patch)
  const pickable = timeBlocks.filter((b) => !b.label)

  const normalizedRooms = (rooms || [])
    .map((r) => (typeof r === 'string' ? { name: r, description: '' } : { name: r?.name || '', description: r?.description || '' }))
    .filter((r) => r.name)

  const matchedRoom = normalizedRooms.find((r) => r.name === d.location)
  const [customRoom, setCustomRoom] = React.useState(() => Boolean(d.location && !matchedRoom))

  return (
    <div className="space-y-4">
      <Band title="Basics" aside={headerAside}>
        <Field label="Name" className="sm:col-span-2">
          <input className={cell} value={d.name} placeholder={namePlaceholder}
            aria-label="Class name" onChange={(e) => set({ name: e.target.value })} />
        </Field>

        {/* Always rendered, even before any staff exist: a school setting up
            its catalog needs to see that a class can stand without a teacher.
            Hiding the field left the only teacher-less path looking broken
            (iCreate: "I want to NOT assign a teacher, but that's not an
            option. We don't have any placeholders any more since I deleted
            them!"). */}
        <Field label="Teacher (optional)">
          <SearchSelect
            value={d.primary_instructor_id}
            onChange={(id) => set({ primary_instructor_id: id })}
            options={staff} getId={(s) => s.id} getLabel={(s) => s.name}
            placeholder={staff.length ? 'Search staff…' : 'No staff to assign yet'}
            emptyLabel="No teacher yet"
          />
        </Field>

        {staff.length > 0 && (
          <Field label="Assistant teacher(s)">
            {d.assistant_instructor_ids.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-1.5">
                {d.assistant_instructor_ids.map((id) => {
                  const s = staff.find((x) => x.id === id)
                  return (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 text-optio-purple text-xs font-medium px-2.5 py-1">
                      {s?.name || 'Staff member'}
                      <button type="button" aria-label={`Remove ${s?.name || 'assistant'}`}
                        onClick={() => set({
                          assistant_instructor_ids: d.assistant_instructor_ids.filter((x) => x !== id),
                        })}
                        className="hover:text-optio-pink font-bold leading-none">×</button>
                    </span>
                  )
                })}
              </div>
            )}
            <SearchSelect
              value=""
              onChange={(id) => {
                if (!id || d.assistant_instructor_ids.includes(id) || id === d.primary_instructor_id) return
                set({ assistant_instructor_ids: [...d.assistant_instructor_ids, id] })
              }}
              options={staff.filter((s) => s.id !== d.primary_instructor_id
                && !d.assistant_instructor_ids.includes(s.id))}
              getId={(s) => s.id} getLabel={(s) => s.name}
              placeholder="Add an assistant…"
            />
            {/* Only worth asking once there is somebody to hide. Staff views
                always show assistants regardless. */}
            {d.assistant_instructor_ids.length > 0 && (
              <label className="mt-1.5 flex items-center gap-2 text-xs text-neutral-500 cursor-pointer">
                <input type="checkbox" checked={d.show_assistants}
                  onChange={(e) => set({ show_assistants: e.target.checked })}
                  className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                <span>Show the assistant to families in the class catalog</span>
              </label>
            )}
          </Field>
        )}

        {/* Row two: the description and, beside it, the image. The description
            is the tall field, so the row's height comes from it and the image
            tile stretches to match rather than sitting in a short box with
            empty space under it. */}
        <Field label="Description" className="sm:col-span-2 lg:col-span-3">
          <textarea className={`${cell} resize-y h-full min-h-[76px]`} value={d.description}
            aria-label="Class description"
            placeholder="What students will do in this class"
            onChange={(e) => set({ description: e.target.value })} />
        </Field>

        {onImageChange && (
          <Field label="Class image">
            {imagePreview ? (
              <div className="relative flex-1">
                <img src={imagePreview} alt="Class" className="w-full h-full min-h-[76px] object-cover rounded-md border border-gray-200" />
                <button type="button" onClick={onImageRemove} aria-label="Remove class image"
                  className="absolute top-1 right-1 p-1 bg-white/90 text-gray-600 hover:text-gray-900 rounded-full shadow">
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex flex-1 items-center justify-center gap-1.5 min-h-[76px] border border-dashed border-gray-300 rounded-md cursor-pointer hover:border-optio-purple hover:bg-gray-50 transition-colors">
                <PhotoIcon className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-500">Add image</span>
                <input type="file" accept="image/*" className="hidden"
                  aria-label="Class image"
                  onChange={(e) => e.target.files?.[0] && onImageChange(e.target.files[0])} />
              </label>
            )}
          </Field>
        )}
      </Band>

      <Band title="Schedule">
        <Field label="Days">
          <div className="inline-flex gap-1">
            {DAY_OPTIONS.map((day) => {
              const selected = d.days_of_week.includes(day.dow)
              return (
                <button key={day.dow} type="button" aria-pressed={selected}
                  aria-label={day.label}
                  onClick={() => set({
                    days_of_week: selected
                      ? d.days_of_week.filter((x) => x !== day.dow)
                      : [...d.days_of_week, day.dow],
                  })}
                  className={`w-7 h-7 rounded text-xs font-semibold border transition-colors ${
                    selected
                      ? 'bg-optio-purple text-white border-transparent'
                      : 'bg-white text-neutral-400 border-gray-200 hover:border-optio-purple'}`}>
                  {day.short}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Time">
          {pickable.length ? (
            <div className="flex items-center gap-1">
              <select className={`${cell} px-1`} value={d.start_time} aria-label="Start block"
                onChange={(e) => {
                  const b = pickable.find((x) => hhmm(x.start) === e.target.value)
                  if (b) set({ start_time: hhmm(b.start), duration_minutes: String(blockMinutes(b)) })
                }}>
                <option value="" disabled>Start</option>
                {pickable.map((b, i) => <option key={i} value={hhmm(b.start)}>{fmt12ap(b.start)}</option>)}
              </select>
              <span className="text-neutral-300">–</span>
              <select className={`${cell} px-1`} value={addMin(d.start_time, d.duration_minutes)} aria-label="End time"
                disabled={!d.start_time}
                onChange={(e) => set({ duration_minutes: String(minutesBetween(d.start_time, e.target.value)) })}>
                {blockEndOptions(timeBlocks, d.start_time, addMin(d.start_time, d.duration_minutes)).map((end) => (
                  <option key={end} value={end}>{fmt12ap(end)}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <input type="time" className={cell} value={d.start_time} aria-label="Start time"
                onChange={(e) => set({ start_time: e.target.value })} />
              <input type="number" className={`${cell} w-20`} min={5} step={5} placeholder="min"
                aria-label="Duration (minutes)" value={d.duration_minutes}
                onChange={(e) => set({ duration_minutes: e.target.value })} />
            </div>
          )}
        </Field>

        <Field label="Classroom">
          {normalizedRooms.length > 0 ? (
            <div className="space-y-1">
              <select
                className={cell}
                value={customRoom ? '__custom__' : (d.location || '')}
                aria-label="Classroom"
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setCustomRoom(true)
                  } else {
                    setCustomRoom(false)
                    set({ location: e.target.value })
                  }
                }}
              >
                <option value="">No room assigned</option>
                {normalizedRooms.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}{r.description ? ` (${r.description})` : ''}
                  </option>
                ))}
                <option value="__custom__">Custom / Other room...</option>
              </select>

              {customRoom && (
                <input
                  className={cell}
                  placeholder="Enter custom room"
                  value={d.location || ''}
                  aria-label="Custom classroom name"
                  onChange={(e) => set({ location: e.target.value })}
                />
              )}

              {!customRoom && matchedRoom?.description && (
                <p className="text-[11px] text-neutral-500 leading-tight">
                  {matchedRoom.description}
                </p>
              )}
            </div>
          ) : (
            <input className={cell} placeholder="Room" value={d.location || ''} aria-label="Classroom"
              onChange={(e) => set({ location: e.target.value })} />
          )}
        </Field>

        {/* A rule about which days a student must fill — a schedule constraint,
            so it sits with the schedule and fills the fourth column. */}
        <Field label="Full-day program">
          <label className="inline-flex items-center gap-2 cursor-pointer h-[38px]">
            <input type="checkbox" checked={d.requires_full_day}
              aria-label="Requires a full day of classes"
              onChange={(e) => set({ requires_full_day: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
            <span className="text-xs text-neutral-500 leading-tight">Must fill its meeting days</span>
          </label>
        </Field>
      </Band>

      <Band title="Enrollment & money" cols={5}>
        <Field label="Capacity">
          <input type="number" min={1} className={cell} placeholder="Unlimited" value={d.capacity}
            aria-label="Capacity" onChange={(e) => set({ capacity: e.target.value })} />
        </Field>

        <Field label="Ages">
          <div className="flex items-center gap-1">
            <input type="number" min={0} className={cell} placeholder="Min" value={d.min_age}
              aria-label="Minimum age" onChange={(e) => set({ min_age: e.target.value })} />
            <span className="text-neutral-300">–</span>
            <input type="number" min={0} className={cell} placeholder="Max" value={d.max_age}
              aria-label="Maximum age" onChange={(e) => set({ max_age: e.target.value })} />
          </div>
        </Field>

        <Field label="Tuition">
          <Money value={d.tuition} label="Tuition" onChange={(v) => set({ tuition: v })} />
        </Field>

        <Field label="Supply fee">
          <Money value={d.supply_fee} label="Supply fee" onChange={(v) => set({ supply_fee: v })} />
        </Field>

        <Field label="Materials allowance">
          <Money value={d.supply_budget_per_student} label="Materials allowance per student"
            placeholder="School default"
            onChange={(v) => set({ supply_budget_per_student: v })} />
          <p className="mt-0.5 text-[10px] text-neutral-400 leading-tight">
            Per student/year. Blank = school default.
          </p>
        </Field>

      </Band>
    </div>
  )
}
