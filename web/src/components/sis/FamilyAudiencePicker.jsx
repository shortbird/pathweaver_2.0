import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import PeoplePicker from './ui/PeoplePicker'
import SearchSelect from '../ui/SearchSelect'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * Choosing which families a message goes to.
 *
 * The office thinks in students -- "the elementary parents", "Ceramics",
 * "everyone under nine" -- and the message goes to their guardians. So the
 * controls name students (every class or one, an age range) and the list that
 * comes back is the parents, each with the children that put them here, so
 * a whole list can be picked in one click and one family dropped before
 * sending. Students are never in the list. (Molly, iCreate, 2026-09-14 b4a4d250 and 2026-09-17 b32b2fca.)
 *
 * The age is the SIS's one age, as of the first day of school. A student with
 * no birth date on file cannot be placed in a range, so the count says how
 * many the filter had to leave out rather than letting the office assume it
 * reached everyone.
 *
 * A filter SHOWS families; it never changes who is picked. Until 2026-09-22
 * every filter change replaced the selection with whoever it found, so the
 * office could not build an audience out of two filters -- "the CLD parents
 * and the Robotics parents" was two messages (Molly, iCreate, 77efe09b). Now
 * picks persist across filters, "Select all" adds the families on screen, the
 * count above the list says how many are picked in total, and "Clear all"
 * starts over. Nothing is ticked on its own: with picks that persist, a list
 * that ticked itself would quietly keep the whole school in the send after
 * someone narrowed to one class, and an age range would tick "5 and up" while
 * the second box was still being typed.
 *
 * The caller owns the selection (a Set of guardian ids) and the people list,
 * because the send needs both; this owns the filter and the fetch, and
 * remembers every family it has shown so a pick from an earlier filter still
 * has a name. `onAudienceLabel` hears the filters "Select all" was used on
 * ("Art, ages 5 to 8"), which a staff copy quotes so the teacher knows who
 * the families were.
 */
export default function FamilyAudiencePicker({ orgId, people, setPeople, selected, setSelected, onAudienceLabel }) {
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [summary, setSummary] = useState({ students: 0, without_birthdate: 0 })
  // Every family any filter has shown, so picks from an earlier filter keep
  // their names after the list moves on.
  const [known, setKnown] = useState(() => new Map())
  const [labels, setLabels] = useState([])
  // Loading is "the filter on screen is not the one the list answers", so a
  // change to any control reads as loading until its own response lands.
  const filterKey = `${classId}|${ageMin}|${ageMax}`
  const [answeredKey, setAnsweredKey] = useState(null)
  const loading = answeredKey !== filterKey

  // A digit or nothing. Letters never reach the request, so a typo cannot
  // turn the audience into a 400 halfway through writing the message.
  const digits = (v) => v.replace(/\D/g, '').slice(0, 3)

  useEffect(() => {
    let alive = true
    const params = new URLSearchParams()
    if (classId) params.set('class_id', classId)
    if (ageMin !== '') params.set('age_min', ageMin)
    if (ageMax !== '') params.set('age_max', ageMax)
    const qs = params.toString()
    api.get(withOrg(`/api/sis/messaging/family-audience${qs ? `?${qs}` : ''}`, orgId))
      .then((r) => {
        if (!alive) return
        const list = r.data?.people || []
        setPeople(list)
        setClasses(r.data?.classes || [])
        setSummary({ students: r.data?.students || 0, without_birthdate: r.data?.without_birthdate || 0 })
        setKnown((prev) => {
          const next = new Map(prev)
          list.forEach((p) => next.set(p.id, p))
          return next
        })
        // Deliberately no setSelected here: a filter shows, it does not pick
        // (see the docstring, 77efe09b).
        setAnsweredKey(filterKey)
      })
      .catch((err) => {
        if (!alive) return
        toast.error(err?.response?.data?.error || 'Could not load the families')
        setAnsweredKey(filterKey)
      })
    return () => { alive = false }
  }, [orgId, classId, ageMin, ageMax, filterKey, setPeople])

  useEffect(() => { onAudienceLabel?.(labels.join('; ')) }, [labels, onAudienceLabel])

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const classOptions = useMemo(() => classes, [classes])
  const rangeLabel = ageMin !== '' && ageMax !== '' ? `ages ${ageMin} to ${ageMax}`
    : ageMin !== '' ? `ages ${ageMin} and up`
      : ageMax !== '' ? `ages ${ageMax} and under` : ''
  const className = classes.find((c) => c.id === classId)?.name
  const filterLabel = [className, rangeLabel].filter(Boolean).join(', ') || 'every class'

  const inView = people.filter((p) => selected.has(p.id)).length
  const allInView = people.length > 0 && inView === people.length
  const selectShown = () => {
    setSelected((prev) => new Set([...prev, ...people.map((p) => p.id)]))
    setLabels((prev) => (prev.includes(filterLabel) ? prev : [...prev, filterLabel]))
  }
  const clearShown = () => setSelected((prev) => {
    const next = new Set(prev)
    people.forEach((p) => next.delete(p.id))
    return next
  })
  const clearAll = () => { setSelected(new Set()); setLabels([]) }
  // Picks the list on screen does not show, so they are not invisible.
  const shownIds = new Set(people.map((p) => p.id))
  const elsewhere = [...selected].filter((id) => !shownIds.has(id))
  const ELSEWHERE_SHOWN = 12

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          {/* Names the people who get the message, not the people it is about.
              "Students in" made an org admin stop and ask whether the send
              went to the children too (2026-09-22); it never does -- the
              recipient list is built from guardians only. */}
          <span className="block text-xs font-medium text-neutral-600 mb-1">Parents of students in</span>
          <SearchSelect value={classId} onChange={setClassId} options={classOptions}
            getId={(c) => c.id} getLabel={(c) => c.name}
            placeholder="Every class" emptyLabel="Every class" />
        </div>
        <div>
          <span className="block text-xs font-medium text-neutral-600 mb-1">Ages (optional)</span>
          <div className="flex items-center gap-2">
            <input inputMode="numeric" value={ageMin} onChange={(e) => setAgeMin(digits(e.target.value))}
              placeholder="from" aria-label="Youngest age"
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
            <span className="text-sm text-neutral-500">to</span>
            <input inputMode="numeric" value={ageMax} onChange={(e) => setAgeMax(digits(e.target.value))}
              placeholder="to" aria-label="Oldest age"
              className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
          </div>
        </div>
      </div>

      <p className="text-xs text-neutral-500" aria-live="polite">
        {loading ? 'Finding families…' : (
          <>
            {inView} of {people.length} {people.length === 1 ? 'parent' : 'parents'} of{' '}
            {summary.students} {summary.students === 1 ? 'student' : 'students'}
            {rangeLabel ? ` ${rangeLabel}` : ''}
            {summary.without_birthdate > 0 && (
              <span className="text-amber-700">
                {' '}· {summary.without_birthdate} {summary.without_birthdate === 1 ? 'student has' : 'students have'} no
                birth date on file and {summary.without_birthdate === 1 ? 'is' : 'are'} left out
              </span>
            )}
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-live="polite">
        <span className="font-medium text-neutral-700">
          {selected.size} {selected.size === 1 ? 'parent' : 'parents'} selected
        </span>
        {elsewhere.length > 0 && (
          <>
            <span className="text-neutral-500">· also picked from other filters:</span>
            {elsewhere.slice(0, ELSEWHERE_SHOWN).map((id) => {
              const name = known.get(id)?.name || 'Parent'
              return (
                <span key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 px-2 py-0.5 text-optio-purple">
                  {name}
                  <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${name}`}
                    className="font-bold hover:text-optio-pink">×</button>
                </span>
              )
            })}
            {elsewhere.length > ELSEWHERE_SHOWN && (
              <span className="text-neutral-500">and {elsewhere.length - ELSEWHERE_SHOWN} more</span>
            )}
          </>
        )}
        {selected.size > 0 && (
          <button type="button" onClick={clearAll} className="text-neutral-500 hover:underline px-1">
            Clear all
          </button>
        )}
      </div>

      <PeoplePicker people={people} selected={selected} onToggle={toggle}
        getLabel={(p) => p.name || 'Parent'}
        getSearchText={(p) => `${p.name || ''} ${(p.students || []).join(' ')}`}
        renderMeta={(p) => ((p.students || []).length > 0 && (
          <span className="block text-xs text-neutral-500 truncate">{p.students.join(', ')}</span>
        ))}
        actions={people.length > 0 && (
          <button type="button" onClick={allInView ? clearShown : selectShown}
            className="text-xs text-optio-purple hover:underline whitespace-nowrap">
            {allInView ? 'Clear' : `Select all ${people.length}`}
          </button>
        )}
        placeholder="Search parents or students" searchLabel="Search families"
        emptyLabel={loading ? 'Finding families…' : 'No families match this.'} />
    </div>
  )
}
