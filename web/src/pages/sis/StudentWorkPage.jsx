import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon, PlusIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useSisOrg } from './useSisOrg'
import { isSisAdmin } from './sisRole'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import QuestEditor from '../../components/sis/QuestEditor'
import QuestDraftsList from '../../components/sis/questEditor/QuestDraftsList'
import GiveQuestModal from '../../components/sis/studentWork/GiveQuestModal'
import StudentQuestCard from '../../components/sis/studentWork/StudentQuestCard'
import StudentNotes from '../../components/sis/studentWork/StudentNotes'
import { useRefreshStudentWork, useStudentWork } from '../../hooks/api/useStudentWork'
import { useRefreshAfterQuestEdit } from '../../hooks/api/useQuestEditor'

/**
 * One student, for a teacher working with them individually (2026-10-07).
 *
 * Everything in their account, not only what this teacher gave them: a
 * teacher sitting down with a child wants the whole plate. Quests given to
 * them by name come first, soonest due first; then the ones their classes
 * give them; then what they took on themselves. Finished and set-aside
 * quests are below, out of the way.
 *
 * From here a teacher assigns a quest (an existing one, or a new one written
 * for this student in the quest editor), sets its due date, writes a task
 * just for them on any quest they are working on, and keeps private notes.
 */

export default function StudentWorkPage() {
  const { studentId } = useParams()
  const { user } = useAuth()
  const { orgId } = useSisOrg()
  const { data, isLoading, isError, error } = useStudentWork(orgId, studentId)
  const refresh = useRefreshStudentWork(orgId, studentId)
  const refreshQuests = useRefreshAfterQuestEdit(orgId)
  const [giving, setGiving] = useState(false)
  // {questId?} -- a new quest for this student, or a draft being resumed.
  const [writing, setWriting] = useState(null)
  const [showDone, setShowDone] = useState(false)

  if (isLoading) return <p className="text-neutral-500">Loading…</p>
  if (isError || !data?.student) {
    return (
      <div>
        <BackLink />
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4" role="alert">
          {error?.response?.data?.error || 'Could not load this student.'}
        </div>
      </div>
    )
  }

  const { student, guardians = [], quests = [] } = data
  const first = (student.name || '').split(' ')[0] || 'this student'
  const current = quests.filter((q) => !q.completed_at && !q.set_aside)
  const done = quests.filter((q) => q.completed_at || q.set_aside)
  // A student's own DMs open for a teacher who gave them a quest, or for the
  // office (services/direct_message_service).
  const canMessage = isSisAdmin(user) || quests.some((q) => q.individual?.assigned_by === user?.id)

  return (
    <div>
      <BackLink />
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          {student.avatar_url && (
            <img src={student.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-neutral-900 truncate">{student.name}</h1>
            <p className="text-sm text-neutral-500 flex flex-wrap gap-x-3">
              {canMessage && (
                <Link to={`/inbox?tab=mine&to=${student.id}`} className="text-optio-purple hover:underline">
                  Message {first}
                </Link>
              )}
              {guardians.map((g) => (
                <Link key={g.id} to={`/inbox?tab=mine&to=${g.id}`} className="text-optio-purple hover:underline">
                  Message {g.name}
                </Link>
              ))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setWriting({})}>
            <PencilSquareIcon className="w-4 h-4 mr-1.5" /> Write a new quest
          </Button>
          <Button size="sm" onClick={() => setGiving(true)}>
            <PlusIcon className="w-4 h-4 mr-1.5" /> Assign a quest
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <QuestDraftsList orgId={orgId} context="student" studentId={student.id}
            onResume={(d) => setWriting({ questId: d.id })} />

          <h2 className="text-sm font-semibold text-neutral-900 mb-2">
            Working on <span className="font-normal text-neutral-400">({current.length})</span>
          </h2>
          {!current.length && (
            <EmptyState plain title={`${first} has no quests right now`}
              hint="Assign one from your school's quests or the Optio library, or write a new one just for them." />
          )}
          <div className="space-y-3">
            {current.map((q) => (
              <StudentQuestCard key={q.quest_id} orgId={orgId} student={student} quest={q}
                onChanged={refresh} defaultOpen={current.length === 1} />
            ))}
          </div>

          {done.length > 0 && (
            <div className="mt-6">
              <button type="button" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}
                className="text-sm font-semibold text-neutral-700 hover:text-optio-purple">
                {showDone ? 'Hide' : 'Show'} finished and set aside ({done.length})
              </button>
              {showDone && (
                <div className="space-y-3 mt-2">
                  {done.map((q) => (
                    <StudentQuestCard key={q.quest_id} orgId={orgId} student={student} quest={q}
                      onChanged={refresh} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <aside>
          <StudentNotes student={student} />
        </aside>
      </div>

      {giving && (
        <GiveQuestModal orgId={orgId} student={student} onClose={() => setGiving(false)}
          onGiven={refresh} onWriteNew={() => setWriting({})} />
      )}
      {writing && (
        <QuestEditor key={writing.questId || 'new'} context="student" orgId={orgId}
          studentId={student.id} questId={writing.questId || null} inUse={false}
          onDone={() => { refreshQuests(); refresh() }} onClose={() => setWriting(null)} />
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link to="/classes?tab=students"
      className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-optio-purple mb-2">
      <ArrowLeftIcon className="w-4 h-4" /> All students
    </Link>
  )
}
