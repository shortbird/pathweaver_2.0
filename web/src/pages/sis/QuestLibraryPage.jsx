import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { BookOpenIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useSisOrg } from './useSisOrg'
import {
  useSisQuestLibrary, useAddQuestToCurriculum, useAssignQuestToClass, useCreateLibraryQuest,
} from '../../hooks/api/useSisQuestLibrary'
import QuestDraftForm, { blankTask } from '../../components/sis/QuestDraftForm'
import QuestAiDraftPanel from '../../components/sis/QuestAiDraftPanel'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import SearchSelect from '../../components/ui/SearchSelect'
import EmptyState from '../../components/ui/EmptyState'
import Button from '../../components/ui/Button'

/**
 * QuestLibraryPage -- every quest the school owns, in one list, with where
 * each one is in use and a way to put it somewhere from here.
 *
 * Quests were reachable only through the curriculum that carried them, and a
 * quest on no curriculum yet was not reachable at all. Molly (iCreate,
 * 2026-09-14, f9b5f2ea): "I'd like it to be a separate tab under operations.
 * And from there, all the quests would be listed, and we can assign them as
 * needed from there."
 *
 * Assigning means what it means on the other screens, through the same two
 * writes: onto a curriculum (POST /api/sis/quests/<id>/curricula, the writer
 * the curriculum page shares) and onto a class (the class page's own POST
 * /api/sis/classes/<id>/quests, so the class is enrolled the same way, with
 * the same optional due date). Editing stays where the quest lives: a row
 * links to its curriculum, which opens on it.
 *
 * Admin only, like Curriculum. No org picker here: SisLayout is becoming the
 * one place that renders it (sisConcepts.json, org_picker_header), and a
 * superadmin picks the school on any page that still has one.
 */

const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
}) : '')

const Chips = ({ items, labelOf, hrefOf, empty }) => {
  if (!items?.length) return <span className="text-xs text-neutral-400">{empty}</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => (
        hrefOf
          ? <Link key={it.id} to={hrefOf(it)}
              className="inline-block max-w-[12rem] truncate rounded-full bg-optio-purple/10 px-2 py-0.5 text-xs text-optio-purple hover:bg-optio-purple/20"
              title={labelOf(it)}>{labelOf(it)}</Link>
          : <span key={it.id}
              className="inline-block max-w-[12rem] truncate rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700"
              title={labelOf(it)}>{labelOf(it)}</span>
      ))}
    </div>
  )
}

/**
 * The assign dialog for one quest: put it on a curriculum, or on a class.
 * Two small forms rather than one, because they are two different acts: a
 * curriculum is where the quest is kept for next term; a class is where
 * students get it today.
 */
export function AssignQuestModal({ quest, curricula, classes, orgId, onClose }) {
  const [curriculumId, setCurriculumId] = useState('')
  const [classId, setClassId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const addToCurriculumMutation = useAddQuestToCurriculum(orgId)
  const assignToClassMutation = useAssignQuestToClass(orgId)

  const onCurricula = new Set((quest.curricula || []).map((c) => c.id))
  const onClasses = new Set((quest.classes || []).map((c) => c.id))
  const curriculumOptions = curricula.filter((c) => !onCurricula.has(c.id))
  const classOptions = classes.filter((c) => !onClasses.has(c.id))

  const addToCurriculum = async () => {
    if (!curriculumId) return
    try {
      const data = await addToCurriculumMutation.mutateAsync({ questId: quest.id, curriculumId })
      const name = data?.curriculum?.title || 'the curriculum'
      toast.success(data?.added
        ? `Added to ${name}${data.pushed_to_classes ? ` and ${data.pushed_to_classes} of its classes` : ''}`
        : `Already on ${name}`)
      setCurriculumId('')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not add it to that curriculum')
    }
  }

  const assignToClass = async () => {
    if (!classId) return
    try {
      const data = await assignToClassMutation.mutateAsync({ questId: quest.id, classId, dueDate })
      const name = classes.find((c) => c.id === classId)?.name || 'the class'
      const n = data?.students_enrolled
      toast.success(`Assigned to ${name}${typeof n === 'number' ? ` (${n} ${n === 1 ? 'student' : 'students'} enrolled)` : ''}`)
      setClassId('')
      setDueDate('')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not assign it to that class')
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Assign “${quest.title}”`} size="md">
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-neutral-900">Put it on a curriculum</h3>
          <p className="text-xs text-neutral-500 mb-2">
            Kept there for every class that teaches it, this term and next. Classes already on that
            curriculum get it now.
          </p>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <SearchSelect value={curriculumId} onChange={setCurriculumId} options={curriculumOptions}
                getId={(c) => c.id} getLabel={(c) => c.title}
                placeholder={curriculumOptions.length ? 'Search curriculum…' : 'On every curriculum already'}
                emptyLabel="No curriculum matches" />
            </div>
            <Button size="xs" onClick={addToCurriculum} disabled={!curriculumId || addToCurriculumMutation.isPending}
              className="shrink-0">
              {addToCurriculumMutation.isPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
          {quest.curricula?.length > 0 && (
            <p className="text-xs text-neutral-500 mt-2">
              Already on: {quest.curricula.map((c) => c.title).join(', ')}
            </p>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-neutral-900">Assign it to a class</h3>
          <p className="text-xs text-neutral-500 mb-2">
            Its students get the quest in their accounts right away. A due date is optional.
          </p>
          <div className="flex items-start gap-2 flex-wrap">
            <div className="flex-1 min-w-[12rem]">
              <SearchSelect value={classId} onChange={setClassId} options={classOptions}
                getId={(c) => c.id} getLabel={(c) => c.name}
                placeholder={classOptions.length ? 'Search classes…' : 'On every class already'}
                emptyLabel="No class matches" />
            </div>
            <label className="text-sm text-neutral-600 flex items-center gap-1.5">
              Due
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                aria-label="Due date"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </label>
            <Button size="xs" onClick={assignToClass} disabled={!classId || assignToClassMutation.isPending}
              className="shrink-0">
              {assignToClassMutation.isPending ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
          {quest.classes?.length > 0 && (
            <p className="text-xs text-neutral-500 mt-2">
              Already on: {quest.classes.map((c) => c.name).join(', ')}
            </p>
          )}
        </section>
      </div>
    </Modal>
  )
}

/**
 * Building a quest from the library. The same form as the curriculum and
 * class builders (QuestDraftForm) and the same document-to-draft panel, so a
 * quest reads the same wherever it was written; the one difference is that
 * nothing has to exist to hang it on. A curriculum is optional here and the
 * new quest is placed on it in the same request.
 */
export function NewQuestPanel({ curricula, orgId, onDone, onCancel }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tasks, setTasks] = useState([blankTask()])
  const [curriculumId, setCurriculumId] = useState('')
  const create = useCreateLibraryQuest(orgId)
  const hasDraft = Boolean(title.trim() || tasks.some((t) => t.title.trim()))

  const save = async () => {
    if (!title.trim()) { toast.error('Give the quest a title'); return }
    try {
      const data = await create.mutateAsync({
        title: title.trim(), description: description.trim(),
        tasks: tasks.filter((t) => t.title.trim()), curriculumId: curriculumId || null,
      })
      const where = data?.curriculum?.title
      toast.success(where
        ? `Quest created and added to ${where}${data.pushed_to_classes ? ` and ${data.pushed_to_classes} of its classes` : ''}`
        : 'Quest created. Assign it from its row when you are ready.')
      onDone?.()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not create the quest')
    }
  }

  return (
    <div className="border border-optio-purple/30 rounded-xl p-4 space-y-4 bg-optio-purple/5 mb-6">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">New quest</h2>
        <p className="text-xs text-neutral-500">
          Write it here, or draft it from a document. It lands in this list; put it on a curriculum now or later.
        </p>
      </div>
      <QuestAiDraftPanel alwaysOpen hasDraft={hasDraft}
        onDrafted={(d) => { setTitle(d.title); setDescription(d.description); setTasks(d.tasks) }} />
      <QuestDraftForm
        title={title} setTitle={setTitle}
        description={description} setDescription={setDescription}
        tasks={tasks} setTasks={setTasks}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[14rem]">
          <span className="block text-xs font-medium text-neutral-600 mb-1">Put it on a curriculum (optional)</span>
          <SearchSelect value={curriculumId} onChange={setCurriculumId} options={curricula}
            getId={(c) => c.id} getLabel={(c) => c.title}
            placeholder="Search curriculum…" emptyLabel="Not yet" />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50">
            Cancel
          </button>
          <Button size="xs" onClick={save} disabled={create.isPending || !title.trim()}>
            {create.isPending ? 'Creating…' : 'Create quest'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function QuestLibraryPage() {
  const { orgId } = useSisOrg()
  const { data, isLoading, isError, error } = useSisQuestLibrary(orgId)
  const quests = data?.quests || []
  const curricula = data?.curricula || []
  const classes = data?.classes || []
  const loading = !!orgId && isLoading
  const [search, setSearch] = useState('')
  const [assigning, setAssigning] = useState(null) // quest id
  const [adding, setAdding] = useState(false)

  // Filtered here rather than by ?search= so typing does not fire a request
  // per keystroke over a list that fits in one response.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return quests
    return quests.filter((qu) => (
      `${qu.title} ${qu.description || ''} ${(qu.curricula || []).map((c) => c.title).join(' ')} `
      + `${(qu.classes || []).map((c) => c.name).join(' ')}`
    ).toLowerCase().includes(q))
  }, [quests, search])

  const assigningQuest = assigning ? quests.find((q) => q.id === assigning) : null

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900 mb-2">Quests</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Every quest your school has made, wherever it was made. Put one on a curriculum to keep it
        for next term, or assign it straight to a class. To edit a quest, open the curriculum it is on.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[14rem] max-w-md">
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quests, curricula or classes…" aria-label="Search quests" />
        </div>
        {!adding && (
          <Button size="xs" onClick={() => setAdding(true)} className="shrink-0">
            <PlusIcon className="w-4 h-4 mr-1.5" /> Add quest
          </Button>
        )}
      </div>

      {adding && (
        <NewQuestPanel curricula={curricula} orgId={orgId}
          onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}

      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4" role="alert">
          {error?.response?.data?.error || 'Could not load the quest library.'}
        </div>
      )}

      {!loading && !isError && !quests.length && (
        <EmptyState icon={BookOpenIcon} title="No quests yet"
          hint="Quests you build on a curriculum, on a class, or in Training will show up here." />
      )}

      {!loading && quests.length > 0 && rows.length === 0 && (
        <EmptyState plain title="Nothing matches that search" />
      )}

      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Quest</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Tasks</th>
                <th className="px-3 py-3 font-medium">On curriculum</th>
                <th className="px-3 py-3 font-medium">Assigned to</th>
                <th className="px-3 py-3 font-medium whitespace-nowrap">Updated</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((q) => (
                <tr key={q.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{q.title}</div>
                    {q.description && (
                      <div className="text-xs text-neutral-500 line-clamp-2 mt-0.5">{q.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-neutral-700">{q.task_count}</td>
                  <td className="px-3 py-3">
                    <Chips items={q.curricula} labelOf={(c) => c.title}
                      hrefOf={(c) => `/curriculum?curriculum=${c.id}`}
                      empty="Not on a curriculum" />
                  </td>
                  <td className="px-3 py-3">
                    <Chips items={q.classes} labelOf={(c) => c.name} empty="No class yet" />
                  </td>
                  <td className="px-3 py-3 text-neutral-500 whitespace-nowrap">{when(q.updated_at)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <button type="button" onClick={() => setAssigning(q.id)}
                      className="text-sm font-medium text-optio-purple hover:underline">
                      Assign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-neutral-500">
            {rows.length} {rows.length === 1 ? 'quest' : 'quests'}
          </div>
        </div>
      )}

      {assigningQuest && (
        <AssignQuestModal quest={assigningQuest} curricula={curricula} classes={classes} orgId={orgId}
          onClose={() => setAssigning(null)} />
      )}
    </div>
  )
}
