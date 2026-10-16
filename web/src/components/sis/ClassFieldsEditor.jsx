import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronRightIcon, PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline'
import SearchSelect from '../ui/SearchSelect'
import {
  DAY_OPTIONS, hhmm, fmt12ap, blockMinutes, blockEndOptions, addMin, minutesBetween,
} from './classFields'
import { CELL_INPUT_CLASS as cell } from '../ui/Input'
import { moduleKnownOff } from '../../modules/moduleEnabled'

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
 *
 * A building block switches off its own fields (docs/MICROSCHOOL_FIRST_PLAN.md
 * part 2; Horizon, 2026-10-07: a school that does not bill or register through
 * Optio still saw tuition, supply fee, teacher pay, ages and capacity on every
 * class). `org` decides: billing owns the money fields and teacher pay,
 * registration owns capacity, ages and the full-day rule. A hidden field is
 * only hidden -- it stays in the draft, so a save sends back the value the
 * class already had rather than clearing it. A null org (no org in hand)
 * shows everything, as before.
 *
 * `collapseExtras` is for creating a class. The create dialog showed every
 * field at once, most of them iCreate's (assistants, rooms, ages, money, pay),
 * and a school making its first class could not tell what it had to fill in.
 * It keeps name, teacher, description, image, days and time in view and folds
 * everything else under "Additional options", still one click away.
 */

// py-2 so a plain input is the same height as a SearchSelect (which sets its
// own padding) and as the image tile. Packing the fields four-across made the
// old 34px-vs-38px mismatch visible on every row.

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
  // {room name: [{class_id, class_name, day_of_week, start_time, end_time}]} —
  // every slot already booked in each room, from GET /api/sis/room-schedule.
  roomOccupancy = {},
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
  // (message) -> void. Called with the custom-time error ('' when there is
  // none) whenever it changes, and with '' when the editor unmounts. The
  // refused time never reaches the draft, so a host cannot see it there; this
  // is how the host knows to hold its Save (4b38bb72).
  onTimeErrorChange = null,
  // The org whose modules decide which fields show (see the header).
  org = null,
  // The school's other classes, [{id, name, status?}], for "Included with".
  // Empty leaves the field out: there is nothing to pick.
  classOptions = [],
  // Fold the secondary fields under "Additional options" (see the header).
  collapseExtras = false,
  // Rendered first inside "Additional options" (the create form's
  // registration choice). Ignored without collapseExtras.
  extrasLead = null,
}) {
  const set = (patch) => onChange(patch)
  const showBilling = !moduleKnownOff(org, 'billing')
  const showRegistration = !moduleKnownOff(org, 'registration')
  const pickable = timeBlocks.filter((b) => !b.label)
  const [extrasOpen, setExtrasOpen] = useState(false)
  // What is in there, so a closed section is not a mystery box.
  const extrasHint = [
    extrasLead && 'registration',
    staff.length > 0 && 'assistant teachers',
    'classroom',
    showRegistration && 'enrollment',
    showBilling && 'pricing',
    'XP goal',
    'notes',
  ].filter(Boolean).join(', ')

  // Custom time: a class that meets outside the school's teaching blocks.
  // iCreate, 2026-09-30 (4b38bb72): "I'm creating a teacher assignment ...
  // 'Lunch Monitor'. The trouble I'm running into is that it isn't during one
  // of the blocks." The block pickers only offered teaching blocks, so a duty
  // over lunch (a labelled block) or any off-grid hour could not be entered.
  // The scheduler never needed a block — class_meetings.start_time/end_time are
  // authoritative and block_id is simply left empty when the times match none.
  //
  // `timeMode` is null until the user picks, so the mode follows the saved
  // times: a class whose times fit no block opens in Custom time and shows
  // them, rather than a block select pointing at nothing. Deriving it (instead
  // of seeding state once) also survives the blocks arriving after mount.
  const [timeMode, setTimeMode] = useState(null)
  const savedEnd = d.start_time && d.duration_minutes ? addMin(d.start_time, d.duration_minutes) : ''
  const offBlock = Boolean(d.start_time) && pickable.length > 0 && (
    !pickable.some((b) => hhmm(b.start) === hhmm(d.start_time))
    || (savedEnd && !pickable.some((b) => hhmm(b.end) === savedEnd))
  )
  const customTime = pickable.length > 0 && (timeMode === 'custom' || (timeMode == null && offBlock))
  // The end the user typed. Held here, not only in the draft, because an end
  // before the start cannot be expressed as a duration — it is refused, and
  // the draft keeps the last valid time while the input shows what was typed.
  const [customEnd, setCustomEnd] = useState(null)
  const shownEnd = customEnd ?? savedEnd
  const customTimeError = customTime && d.start_time && shownEnd
    && !(minutesBetween(d.start_time, shownEnd) > 0)
    ? 'End time must be after the start time' : ''
  // Through a ref, so a host that passes a new arrow each render does not
  // re-fire the report (and loop through its own setState) every render.
  const reportTimeError = useRef(onTimeErrorChange)
  // Refreshed in an effect, not during render; effects run in order, so the
  // report below always calls the latest callback.
  useEffect(() => { reportTimeError.current = onTimeErrorChange })
  useEffect(() => { reportTimeError.current?.(customTimeError) }, [customTimeError])
  useEffect(() => () => reportTimeError.current?.(''), [])
  const setCustomStart = (start) => {
    setCustomEnd(shownEnd)
    const mins = minutesBetween(start, shownEnd)
    set(mins > 0 ? { start_time: start, duration_minutes: String(mins) } : { start_time: start })
  }
  const setCustomEndTime = (end) => {
    setCustomEnd(end)
    const mins = minutesBetween(d.start_time, end)
    if (mins > 0) set({ duration_minutes: String(mins) })
  }

  const normalizedRooms = (rooms || [])
    .map((r) => (typeof r === 'string' ? { name: r, description: '' } : { name: r?.name || '', description: r?.description || '' }))
    .filter((r) => r.name)

  const matchedRoom = normalizedRooms.find((r) => r.name === d.location)
  const [customRoom, setCustomRoom] = useState(() => Boolean(d.location && !matchedRoom))

  // Which rooms are already taken at the hours THIS class meets. iCreate,
  // 2026-09-04: "on the drop down menu for the rooms, maybe it can show which
  // ones are already occupied that hour." Computed from the draft, so it
  // follows the days and times as they are edited, and it ignores this class's
  // own booking — a class is not competing with itself for its room.
  const draftEnd = addMin(d.start_time, d.duration_minutes)
  const busyRooms = useMemo(() => {
    if (!d.start_time || !draftEnd || !d.days_of_week?.length) return {}
    // hhmm() on BOTH sides before comparing. The draft carries "11:30" and the
    // server sends Postgres time as "11:30:00", and as strings "11:30" sorts
    // BEFORE "11:30:00" — so every class starting exactly when the previous one
    // ended read as an overlap, which is every consecutive pair of blocks
    // (iCreate 7901c118: Theater Jr. in block 3 warned about Brain Games in
    // block 2, in the same room, one ending as the other starts).
    const start = hhmm(d.start_time)
    const end = hhmm(draftEnd)
    const out = {}
    for (const [room, slots] of Object.entries(roomOccupancy || {})) {
      const clash = slots.filter((s) => (
        s.class_id !== d.id
        && d.days_of_week.includes(s.day_of_week)
        && hhmm(s.start_time) < end && start < hhmm(s.end_time)
      ))
      if (clash.length) out[room] = clash
    }
    return out
  }, [roomOccupancy, d.id, d.days_of_week, d.start_time, draftEnd])

  // "Gym — in use (Choir)". The names are what makes it actionable: "in use"
  // alone sends the office looking through the schedule for what is in there.
  const busyLabel = (room) => {
    const clash = busyRooms[room]
    if (!clash) return ''
    const names = [...new Set(clash.map((c) => c.class_name).filter(Boolean))]
    return names.length ? ` — in use (${names.slice(0, 2).join(', ')}${names.length > 2 ? `, +${names.length - 2}` : ''})` : ' — in use'
  }

  const assistantsField = staff.length > 0 && (
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
  )

  const classroomField = (
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
                {r.name}{r.description ? ` (${r.description})` : ''}{busyLabel(r.name)}
              </option>
            ))}
            <option value="__custom__">Custom / Other room...</option>
          </select>

          {/* Rooms beyond the primary one. A pottery class is in the art
              room AND the kiln shed; both are booked for its hour, and the
              double-booking check now reads all of them (43625a45). */}
          {normalizedRooms.length > 1 && (
            <div className="pt-1">
              {(d.additional_locations || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {d.additional_locations.map((r) => (
                    <span key={r}
                      className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 px-2 py-0.5 text-xs text-optio-purple">
                      {r}{busyRooms[r] ? ' — in use' : ''}
                      <button type="button" aria-label={`Remove ${r}`}
                        onClick={() => set({
                          additional_locations: d.additional_locations.filter((x) => x !== r),
                        })}
                        className="text-optio-purple/60 hover:text-red-600">×</button>
                    </span>
                  ))}
                </div>
              )}
              <select className={`${cell} px-1 text-xs`} value=""
                aria-label="Also uses room"
                onChange={(e) => {
                  const room = e.target.value
                  if (room && !(d.additional_locations || []).includes(room)) {
                    set({ additional_locations: [...(d.additional_locations || []), room] })
                  }
                }}>
                <option value="">
                  {(d.additional_locations || []).length ? 'Also uses…' : 'Uses another room too…'}
                </option>
                {normalizedRooms
                  .filter((r) => r.name !== d.location
                    && !(d.additional_locations || []).includes(r.name))
                  .map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}{busyLabel(r.name)}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {!customRoom && busyRooms[d.location] && (
            // Advisory, never a block: a school may genuinely want two
            // things in the gym, and the office is the judge of that.
            <p className="text-xs text-amber-700">
              {d.location} is already booked at this time by{' '}
              {[...new Set(busyRooms[d.location].map((c) => c.class_name).filter(Boolean))].join(', ')}.
            </p>
          )}

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
  )

  {/* A rule about which days a student must fill — a schedule constraint,
      so it sits with the schedule. Only registration enforces it. */}
  const fullDayField = showRegistration && (
    <Field label="Full-day program">
      <label className="inline-flex items-center gap-2 cursor-pointer h-[38px]">
        <input type="checkbox" checked={d.requires_full_day}
          aria-label="Requires a full day of classes"
          onChange={(e) => set({ requires_full_day: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
        <span className="text-xs text-neutral-500 leading-tight">Must fill its meeting days</span>
      </label>
    </Field>
  )

  const parentVisibilityField = (
    <Field label="Parent visibility">
      <label className="inline-flex items-center gap-2 cursor-pointer h-[38px]">
        <input type="checkbox" checked={d.is_visible_to_parents}
          aria-label="Show class to parents"
          onChange={(e) => set({ is_visible_to_parents: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
        <span className="text-xs text-neutral-500 leading-tight">Show to parents on schedule</span>
      </label>
    </Field>
  )

  // A bundled program pays for this class (Apogee NoCo: Hybrid Program
  // includes SPARK Friday Excursions). A student in both is not billed for
  // this one, tuition or supplies; a student who takes it alone pays its
  // price. The backend owns the rule (sis_tuition_service.included_with).
  const includedIds = d.included_with_class_ids || []
  const nameOf = (id) => (classOptions.find((c) => c.id === id) || {}).name || 'Another class'
  const includedWithField = showBilling && classOptions.some((c) => c.id !== d.id) && (
    // A row of its own: it is a sentence-length choice, and squeezed into one
    // column of the five it would leave the band's last row half empty.
    <Field label="Included with" className="sm:col-span-2 lg:col-span-5">
      {includedIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {includedIds.map((id) => (
            <span key={id}
              className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 px-2 py-0.5 text-xs text-optio-purple">
              {nameOf(id)}
              <button type="button" aria-label={`Remove ${nameOf(id)}`}
                onClick={() => set({ included_with_class_ids: includedIds.filter((x) => x !== id) })}
                className="text-optio-purple/60 hover:text-red-600">×</button>
            </span>
          ))}
        </div>
      )}
      <select className={`${cell} max-w-md`} value="" aria-label="Included with"
        onChange={(e) => {
          const id = e.target.value
          if (id && !includedIds.includes(id)) set({ included_with_class_ids: [...includedIds, id] })
        }}>
        <option value="">{includedIds.length ? 'Add another class…' : 'Not included with another class'}</option>
        {classOptions
          .filter((c) => c.id !== d.id && c.status !== 'archived' && !includedIds.includes(c.id))
          .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <p className="mt-0.5 text-[10px] text-neutral-400 leading-tight">
        Students in these classes are not charged for this one. Others pay its price.
      </p>
    </Field>
  )

  // Who can take it, what it costs, how it completes, and the staff notes.
  const secondaryBands = (
    <>
      {(showRegistration || showBilling) && (
      <Band title={showRegistration && showBilling ? 'Enrollment & money' : showBilling ? 'Money' : 'Enrollment'} cols={5}>
        {showRegistration && (
          <>
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
          </>
        )}

        {showBilling && (
        <>
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

        {includedWithField}
        </>
        )}
      </Band>
      )}

      {/* The XP a student earns in the class's quests to complete the class;
          it drives the student's "class complete" percentage. Only the
          organization console could set it until 2026-10-15. 0 = the class
          never completes on XP. Blank on a new class takes the default (100). */}
      <Band title="Progress">
        <Field label="XP to complete">
          <input type="number" min={0} step={1} className={cell} placeholder="100" value={d.xp_threshold ?? ''}
            aria-label="XP to complete the class" onChange={(e) => set({ xp_threshold: e.target.value })} />
        </Field>
        <p className="sm:col-span-1 lg:col-span-3 self-end text-xs text-neutral-500 leading-snug pb-2">
          A student completes the class when they earn this much XP in its quests. 0 means the class never completes on XP.
        </p>
      </Band>

      <Band title="Internal notes">
        {/* Notes take what the two checkboxes leave of the four columns. */}
        <Field label="Staff only — families never see these"
          className={`sm:col-span-2 ${showBilling ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <textarea className={`${cell} resize-y min-h-[56px]`} value={d.internal_notes}
            aria-label="Internal notes"
            placeholder="Room setup, supplies, reminders for the office…"
            onChange={(e) => set({ internal_notes: e.target.value })} />
        </Field>

        {/* iCreate, 2704bbd4: some classes exist only so a teacher has a
            roster. The weekly teaching hours export leaves these out. Pay is
            billing's, so it hides with it. */}
        {showBilling && (
        <Field label="Teacher pay">
          <label className="inline-flex items-center gap-2 cursor-pointer h-[38px]">
            <input type="checkbox" checked={!!d.exclude_from_pay}
              aria-label="Roster only — not paid"
              onChange={(e) => set({ exclude_from_pay: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
            <span className="text-xs text-neutral-500 leading-tight">Roster only — not paid</span>
          </label>
        </Field>
        )}

        {/* iCreate, 29dff954: "Can we have some classes not require
            attendance? Like this would be useful for our At Home days and
            independent study." Nobody is chased for a roll in these. */}
        <Field label="Attendance">
          {/* Grows downward from the checkbox. A fixed 38px row, like its
              one-line neighbours, centred the three-line hint and pushed it up
              over the field label. */}
          <label className="inline-flex items-start gap-2 cursor-pointer min-h-[38px] pt-2.5">
            <input type="checkbox" checked={!!d.attendance_optional}
              aria-label="Attendance not taken"
              onChange={(e) => set({ attendance_optional: e.target.checked })}
              className="h-4 w-4 shrink-0 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
            <span className="text-xs text-neutral-500 leading-snug">
              Attendance not taken
              <span className="block mt-0.5 text-[11px] text-neutral-400">For at-home days and independent study. No roll reminders.</span>
            </span>
          </label>
        </Field>
      </Band>
    </>
  )

  return (
    <div className="space-y-4">
      <Band title="Basics" aside={headerAside}>
        <Field label="Name" className={collapseExtras ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-2'}>
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

        {!collapseExtras && assistantsField}

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

      <Band title="Schedule" cols={collapseExtras ? 4 : 5}>
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

        {/* With the extras folded away the band holds only Days and Time, so
            Time takes two columns and its inputs sit side by side. */}
        <Field label={pickable.length ? 'Time' : 'Start time'} className={collapseExtras ? 'lg:col-span-2' : ''}>
          {pickable.length ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1">
                <select className={`${cell} px-1`} value={customTime ? '__custom__' : hhmm(d.start_time)}
                  aria-label="Start block"
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      // Keep whatever time was there, so the inputs open on
                      // the block's hours as a starting point.
                      setTimeMode('custom')
                      setCustomEnd(savedEnd || null)
                      return
                    }
                    const b = pickable.find((x) => hhmm(x.start) === e.target.value)
                    if (b) {
                      setTimeMode('block')
                      setCustomEnd(null)
                      set({ start_time: hhmm(b.start), duration_minutes: String(blockMinutes(b)) })
                    }
                  }}>
                  <option value="" disabled>Start</option>
                  {pickable.map((b, i) => <option key={i} value={hhmm(b.start)}>{fmt12ap(b.start)}</option>)}
                  <option value="__custom__">Custom time…</option>
                </select>
                {!customTime && (
                  <>
                    <span className="text-neutral-300">–</span>
                    <select className={`${cell} px-1`} value={addMin(d.start_time, d.duration_minutes)} aria-label="End time"
                      disabled={!d.start_time}
                      onChange={(e) => set({ duration_minutes: String(minutesBetween(d.start_time, e.target.value)) })}>
                      {blockEndOptions(timeBlocks, d.start_time, addMin(d.start_time, d.duration_minutes)).map((end) => (
                        <option key={end} value={end}>{fmt12ap(end)}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              {customTime && (
                <>
                  <div className={collapseExtras ? 'flex items-center gap-1' : 'flex flex-col gap-1.5'}>
                    <input type="time" className={cell} value={hhmm(d.start_time)} aria-label="Start time"
                      onChange={(e) => setCustomStart(e.target.value)} />
                    {collapseExtras && <span className="text-neutral-300">–</span>}
                    <input type="time" className={cell} value={shownEnd} aria-label="End time"
                      aria-invalid={customTimeError ? true : undefined}
                      onChange={(e) => setCustomEndTime(e.target.value)} />
                  </div>
                  {customTimeError && (
                    <p role="alert" className="text-[11px] text-red-600 leading-tight">{customTimeError}</p>
                  )}
                </>
              )}
            </div>
          ) : (
            /* Stacked, not side by side: in the five-across Schedule band the
               column is ~115px, and a native time input's minimum width alone
               fills it — the duration box next to it was squeezed invisible
               (Gryffin, 2026-08-22: "I added a start time and I don't see
               where duration is"). The two-column create layout has the room. */
            <div className={collapseExtras ? 'flex items-center gap-2' : 'flex flex-col gap-1.5'}>
              <input type="time" className={cell} value={d.start_time} aria-label="Start time"
                onChange={(e) => set({ start_time: e.target.value })} />
              <div className={collapseExtras ? 'relative w-32 shrink-0' : 'relative'}>
                <input type="number" className={`${cell} pr-10`} min={5} step={5} placeholder="Duration"
                  aria-label="Duration (minutes)" value={d.duration_minutes}
                  onChange={(e) => set({ duration_minutes: e.target.value })} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400 pointer-events-none">min</span>
              </div>
            </div>
          )}
        </Field>

        {!collapseExtras && (
          <>
            {classroomField}
            {fullDayField}
            {parentVisibilityField}
          </>
        )}
      </Band>

      {collapseExtras ? (
        <section className="border-t border-gray-100 pt-3">
          <button type="button" onClick={() => setExtrasOpen((v) => !v)} aria-expanded={extrasOpen}
            className="flex w-full items-center gap-2 text-left text-sm font-medium text-gray-700 hover:text-optio-purple">
            <ChevronRightIcon className={`w-4 h-4 shrink-0 transition-transform ${extrasOpen ? 'rotate-90' : ''}`} />
            <span>Additional options</span>
            {!extrasOpen && (
              <span className="truncate text-xs font-normal text-neutral-400">{extrasHint}</span>
            )}
          </button>
          {extrasOpen && (
            <div className="mt-3 space-y-4">
              {extrasLead}
              <Band title="Details">
                {assistantsField}
                {classroomField}
                {fullDayField}
                {parentVisibilityField}
              </Band>
              {secondaryBands}
            </div>
          )}
        </section>
      ) : secondaryBands}
    </div>
  )
}
