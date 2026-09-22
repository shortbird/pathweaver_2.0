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
 * comes back is the parents, each with the children that put them here, all
 * ticked, so one family can be dropped before sending. Students are never in
 * the list. (Molly, iCreate, 2026-09-14 b4a4d250 and 2026-09-17 b32b2fca.)
 *
 * The age is the SIS's one age, as of the first day of school. A student with
 * no birth date on file cannot be placed in a range, so the count says how
 * many the filter had to leave out rather than letting the office assume it
 * reached everyone.
 *
 * The caller owns the selection (a Set of guardian ids) and the people list,
 * because the send needs both; this owns the filter and the fetch.
 */
export default function FamilyAudiencePicker({ orgId, people, setPeople, selected, setSelected }) {
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [ageMin, setAgeMin] = useState('')
  const [ageMax, setAgeMax] = useState('')
  const [summary, setSummary] = useState({ students: 0, without_birthdate: 0 })
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
        // A new filter is a new audience: everyone it names starts ticked.
        setSelected(new Set(list.map((p) => p.id)))
        setAnsweredKey(filterKey)
      })
      .catch((err) => {
        if (!alive) return
        toast.error(err?.response?.data?.error || 'Could not load the families')
        setAnsweredKey(filterKey)
      })
    return () => { alive = false }
  }, [orgId, classId, ageMin, ageMax, filterKey, setPeople, setSelected])

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const classOptions = useMemo(() => classes, [classes])
  const rangeLabel = ageMin !== '' && ageMax !== '' ? `ages ${ageMin} to ${ageMax}`
    : ageMin !== '' ? `ages ${ageMin} and up`
      : ageMax !== '' ? `ages ${ageMax} and under` : ''

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
            {selected.size} of {people.length} {people.length === 1 ? 'parent' : 'parents'} of{' '}
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

      <PeoplePicker people={people} selected={selected} onToggle={toggle}
        getLabel={(p) => p.name || 'Parent'}
        getSearchText={(p) => `${p.name || ''} ${(p.students || []).join(' ')}`}
        renderMeta={(p) => ((p.students || []).length > 0 && (
          <span className="block text-xs text-neutral-500 truncate">{p.students.join(', ')}</span>
        ))}
        actions={people.length > 0 && (
          <button type="button"
            onClick={() => setSelected(selected.size === people.length ? new Set() : new Set(people.map((p) => p.id)))}
            className="text-xs text-optio-purple hover:underline whitespace-nowrap">
            {selected.size === people.length ? 'Clear' : 'Select all'}
          </button>
        )}
        placeholder="Search parents or students" searchLabel="Search families"
        emptyLabel={loading ? 'Finding families…' : 'No families match this.'} />
    </div>
  )
}
