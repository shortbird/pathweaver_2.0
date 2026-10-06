import React, { useState } from 'react'
import { AcademicCapIcon } from '@heroicons/react/24/outline'
import { AudiencePicker } from '../questEditor/ClassSettingsSection'

/**
 * One curriculum attached to a class, on the class's Quests tab.
 *
 * Its saved quest set can be put on the class for everyone or, through "Who
 * gets it", for chosen students. iCreate, 1a630837 (2026-10-06): an
 * independent-study class carries several curricula ("Applied Physics", "U.S.
 * History 1", ...) and each student takes some of them, so "add the whole set
 * to the whole class" was the wrong shape.
 *
 * The backend never takes a quest from anyone through this door: a quest
 * already on the class for everyone stays that way, and one kept to some
 * students gains the ones picked here (services/class_curriculum_assign).
 *
 * onAdd(curriculum, studentIds) -- studentIds null is everyone.
 */
export default function CurriculumCard({
  curriculum: c, students = [], busy = false, onAdd, canSave = false, onSave,
}) {
  const [picking, setPicking] = useState(false)
  const [studentIds, setStudentIds] = useState(null)
  const everyone = studentIds === null
  const n = c.quests.length
  const addLabel = everyone
    ? (c.missing_count > 0 ? `Add ${c.missing_count} to this class` : 'Give to everyone')
    : `Give ${n} quest${n === 1 ? '' : 's'} to ${studentIds.length} student${studentIds.length === 1 ? '' : 's'}`

  const add = async () => {
    await onAdd(c, studentIds)
    setPicking(false)
    setStudentIds(null)
  }

  return (
    <div className="rounded-xl border border-optio-purple/20 bg-optio-purple/5 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AcademicCapIcon className="w-5 h-5 text-optio-purple shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900 truncate">{c.title}</p>
          <p className="text-xs text-neutral-500">
            {n === 0
              ? 'No quests saved to this curriculum yet — save this class’s list to reuse it next year.'
              : c.missing_count > 0
                ? `${c.missing_count} of ${n} saved quest${n === 1 ? '' : 's'} not on this class yet`
                : `All ${n} saved quest${n === 1 ? '' : 's'} are on this class`}
          </p>
        </div>
        {n > 0 && (
          <button type="button" onClick={() => setPicking((p) => !p)} aria-expanded={picking}
            className="shrink-0 text-sm font-medium text-optio-purple hover:underline">
            {picking ? 'Hide who gets it' : 'Who gets it'}
          </button>
        )}
        {n > 0 && (c.missing_count > 0 || !everyone) && (
          <button type="button" disabled={busy || (!everyone && studentIds.length === 0)}
            onClick={add}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-optio-purple/40 text-sm font-medium text-optio-purple hover:bg-optio-purple/10 disabled:opacity-50">
            {busy ? 'Adding…' : addLabel}
          </button>
        )}
        {/* Office only: it replaces the curriculum's saved set for every
            class that uses it. iCreate, 93af5014: "I don't think we want
            the 'Save this class's quests to the curriculum.'" */}
        {canSave && (
          <button type="button" disabled={busy} onClick={() => onSave(c)}
            title="Replaces the curriculum's saved set with this class's quests"
            className="shrink-0 text-sm font-medium text-optio-purple hover:underline disabled:opacity-50">
            {busy ? '…' : 'Save this class’s quests to the curriculum'}
          </button>
        )}
      </div>
      {picking && (
        <div className="mt-3 rounded-lg bg-white border border-gray-200 p-3">
          <AudiencePicker value={studentIds} onChange={setStudentIds} students={students}
            label={`Who gets ${c.title}`} />
          <p className="mt-2 text-xs text-neutral-500">
            Every quest in this curriculum goes to the students you pick. A quest already on the class keeps
            the students it has and adds these. Nobody loses a quest here.
          </p>
        </div>
      )}
    </div>
  )
}
