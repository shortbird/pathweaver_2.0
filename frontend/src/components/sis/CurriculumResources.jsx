import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { AcademicCapIcon, SparklesIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import SearchSelect from '../ui/SearchSelect'

/**
 * The teaching material a curriculum carries — its quests and its courses.
 *
 * iCreate, 2026-08-06: "admin should attach courses/quests to curriculum so
 * they're reusable year after year and teachers have resources to use, rather
 * than requiring teachers to create their own quests."
 *
 * Both sets could already be edited from a class, which is the wrong direction
 * for setting up a year: an admin building next year's curriculum has no
 * sections yet to edit them from. Here they are edited on the durable object,
 * and classes inherit.
 *
 * The two behave differently, and the copy says so rather than leaving it as a
 * surprise:
 *   - quests are COPIED onto a section, so a section owns its own list and
 *     changing the curriculum affects the NEXT class set up from it;
 *   - courses are LINKED, so a change here shows on every class immediately.
 */

const Empty = ({ children }) => <p className="text-sm text-neutral-400">{children}</p>

export default function CurriculumResources({ orgId, curriculumId, canManage, onChanged }) {
  const [quests, setQuests] = useState([])
  const [courses, setCourses] = useState([])
  const [questOptions, setQuestOptions] = useState([])
  const [courseOptions, setCourseOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get(withOrg(`/api/sis/curriculum/${curriculumId}/resources`, orgId))
      .then((r) => {
        setQuests(r.data?.quests || [])
        setCourses(r.data?.courses || [])
      })
      .catch(() => toast.error('Could not load what this curriculum carries'))
      .finally(() => setLoading(false))
  }, [orgId, curriculumId])

  useEffect(() => { load() }, [load])

  // Pickers are admin-only, and only worth fetching for an admin.
  useEffect(() => {
    if (!canManage) return
    api.get(withOrg(`/api/sis/curriculum/${curriculumId}/assignable-quests`, orgId))
      .then((r) => setQuestOptions(r.data?.quests || [])).catch(() => setQuestOptions([]))
    api.get(withOrg(`/api/sis/curriculum/${curriculumId}/assignable-courses`, orgId))
      .then((r) => setCourseOptions(r.data?.courses || [])).catch(() => setCourseOptions([]))
  }, [orgId, curriculumId, canManage, quests.length, courses.length])

  const saveQuests = async (next) => {
    setBusy(true)
    try {
      await api.put(withOrg(`/api/sis/curriculum/${curriculumId}/quests`, orgId),
        { quest_ids: next.map((q) => q.id) })
      setQuests(next)
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the quest set')
      load()
    } finally { setBusy(false) }
  }

  const saveCourses = async (next) => {
    setBusy(true)
    try {
      await api.put(withOrg(`/api/sis/curriculum/${curriculumId}/courses`, orgId),
        { course_ids: next.map((c) => c.id) })
      setCourses(next)
      onChanged?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the courses')
      load()
    } finally { setBusy(false) }
  }

  if (loading) return <p className="text-sm text-neutral-400">Loading…</p>

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Quests */}
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2 mb-1">
          <SparklesIcon className="w-4 h-4 text-optio-purple" />
          <h4 className="text-sm font-semibold text-neutral-800">Quests</h4>
        </div>
        <p className="text-xs text-neutral-400 mb-2">
          The set a class starts from. Classes copy these, so a change here applies to the
          next class set up from this curriculum — it never rewrites a class in progress.
        </p>
        {!quests.length ? <Empty>Nothing saved yet.</Empty> : (
          <ul className="divide-y divide-gray-50 mb-2">
            {quests.map((q) => (
              <li key={q.id} className="py-1.5 flex items-center gap-2 text-sm">
                <span className="text-neutral-800 flex-1 min-w-0 truncate">{q.title}</span>
                {canManage && (
                  <button type="button" disabled={busy}
                    aria-label={`Remove ${q.title}`}
                    onClick={() => saveQuests(quests.filter((x) => x.id !== q.id))}
                    className="text-xs text-red-500 hover:underline shrink-0">Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <SearchSelect
            value=""
            onChange={(id) => {
              const pick = questOptions.find((o) => o.quest_id === id)
              if (pick) saveQuests([...quests, { id: pick.quest_id, title: pick.title }])
            }}
            options={questOptions}
            getId={(o) => o.quest_id}
            getLabel={(o) => o.title}
            placeholder="Add a quest…"
          />
        )}
      </div>

      {/* Courses */}
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2 mb-1">
          <AcademicCapIcon className="w-4 h-4 text-optio-purple" />
          <h4 className="text-sm font-semibold text-neutral-800">Courses</h4>
        </div>
        <p className="text-xs text-neutral-400 mb-2">
          Optio courses that go with this curriculum. Every class using it shows these, so
          teachers open the school&apos;s course instead of building their own.
        </p>
        {!courses.length ? <Empty>No course attached.</Empty> : (
          <ul className="divide-y divide-gray-50 mb-2">
            {courses.map((c) => (
              <li key={c.id} className="py-1.5 flex items-center gap-2 text-sm">
                <span className="text-neutral-800 flex-1 min-w-0 truncate">{c.title}</span>
                {c.status && c.status !== 'published' && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-neutral-500 shrink-0 capitalize">
                    {c.status}
                  </span>
                )}
                {canManage && (
                  <button type="button" disabled={busy}
                    aria-label={`Remove ${c.title}`}
                    onClick={() => saveCourses(courses.filter((x) => x.id !== c.id))}
                    className="text-xs text-red-500 hover:underline shrink-0">Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <SearchSelect
            value=""
            onChange={(id) => {
              const pick = courseOptions.find((o) => o.course_id === id)
              if (pick) saveCourses([...courses, { id: pick.course_id, title: pick.title, status: pick.status }])
            }}
            options={courseOptions}
            getId={(o) => o.course_id}
            getLabel={(o) => o.title}
            placeholder="Add a course…"
          />
        )}
      </div>
    </div>
  )
}
