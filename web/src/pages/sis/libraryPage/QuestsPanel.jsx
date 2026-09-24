import React, { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { BookOpenIcon, EllipsisVerticalIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useSisOrg } from '../useSisOrg'
import {
  useSisQuestLibrary, useAddQuestToCurriculum, useAssignQuestToClass,
  useGiveQuestToStudents, useDuplicateLibraryQuest, useQuestHolders,
} from '../../../hooks/api/useSisQuestLibrary'
import { useRefreshAfterQuestEdit } from '../../../hooks/api/useQuestEditor'
import { useSisRoster } from '../../../hooks/api/useSisRoster'
import QuestResourcesPanel from '../../../components/sis/QuestResourcesPanel'
import QuestEditor from '../../../components/sis/QuestEditor'
import QuestDraftsList from '../../../components/sis/questEditor/QuestDraftsList'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import SearchSelect from '../../../components/ui/SearchSelect'
import EmptyState from '../../../components/ui/EmptyState'
import Button from '../../../components/ui/Button'
import PopMenu from '../../../components/sis/ui/PopMenu'

/**
 * QuestsPanel -- every quest the school owns, in one list, with where each
 * one is in use and a way to put it somewhere from here.
 *
 * Quests were reachable only through the curriculum that carried them, and a
 * quest on no curriculum yet was not reachable at all. Molly (iCreate,
 * 2026-09-14, f9b5f2ea): "I'd like it to be a separate tab under operations.
 * And from there, all the quests would be listed, and we can assign them as
 * needed from there." It was its own page for three days; since M22 it is
 * the Quests tab of Library, beside the Curriculum tab that edits them --
 * the tab she asked for, on the page where quests live.
 *
 * Assigning means what it means on the other screens, through the same two
 * writes: onto a curriculum (POST /api/sis/quests/<id>/curricula, the writer
 * the curriculum page shares, except that from here it does not push the
 * quest to the curriculum's classes -- Molly, a933ee02, 2026-09-22: "Attach
 * to a curriculum should not assign it to all the classes") and onto a class (the class page's own POST
 * /api/sis/classes/<id>/quests, so the class is enrolled the same way, with
 * the same optional due date).
 *
 * Editing is here too, since 2026-09-22. It used to live only on the
 * curriculum the quest sat on, which meant the quests this page exists for --
 * the ones on no curriculum -- had no editor anywhere. Molly again: "There's
 * no way to edit a quest that I can see. I'd also love to be able to
 * duplicate quests." Add quest and Edit both open QuestEditor, the one quest
 * form every SIS screen shares since P6 (2026-09-23). Add quest starts an
 * inactive draft at once, so its files and links work from the first minute;
 * Drafts lists every unpublished quest in the school, including a teacher's
 * class draft, until somebody publishes or discards it.
 *
 * Attachments (a video, a link, a file, on the quest or on one task) are the
 * same QuestResourcesPanel the curriculum editor shows. They were reachable
 * only there, and a quest written here and not yet on a curriculum had no
 * editor at all, so Molly asked for the feature that already existed
 * (iCreate, 2026-09-18, 5a20862f). A new quest opens on its attachments the
 * moment it is created, and every row has an Attachments action.
 *
 * The list is two lists to the school: the office's own library and what
 * teachers build for their classes ("the master library and another teacher
 * created library", 2026-09-18, 4579be68). Same table, told apart by who
 * wrote the quest, with a filter for either half.
 *
 * Admin only, like Curriculum. No org picker here: SisLayout is becoming the
 * one place that renders it (sisConcepts.json, org_picker_header), and a
 * superadmin picks the school on any page that still has one.
 */

const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric',
}) : '')

// At most MAX_CHIPS, then a count. A quest pushed to every section of a
// microschool carries nine class chips; stacked, one row grew taller than the
// screen and the column demanded width the table did not have (2026-09-22).
// The rest are named in the tooltip, and the Assign dialog is the place that
// lists them properly.
const MAX_CHIPS = 3

const Chips = ({ items, labelOf, hrefOf, empty }) => {
  if (!items?.length) return <span className="text-xs text-neutral-400">{empty}</span>
  const shown = items.slice(0, MAX_CHIPS)
  const rest = items.slice(MAX_CHIPS)
  return (
    <div className="flex flex-wrap gap-1 min-w-0">
      {shown.map((it) => (
        hrefOf
          ? <Link key={it.id} to={hrefOf(it)}
              className="inline-block max-w-full truncate rounded-full bg-optio-purple/10 px-2 py-0.5 text-xs text-optio-purple hover:bg-optio-purple/20"
              title={labelOf(it)}>{labelOf(it)}</Link>
          : <span key={it.id}
              className="inline-block max-w-full truncate rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700"
              title={labelOf(it)}>{labelOf(it)}</span>
      ))}
      {rest.length > 0 && (
        <span className="inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500"
          title={rest.map(labelOf).join('\n')}>
          +{rest.length} more
        </span>
      )}
    </div>
  )
}

/**
 * The assign dialog for one quest: put it on a curriculum, on a class, or
 * give it to students by name. Three small forms rather than one, because
 * they are three different acts: a curriculum is where the quest is kept for
 * next term; a class is where its students get it today; a named student is
 * the one who needs it and is in no class that carries it (Dallin, iCreate,
 * 2026-09-18: "Can we assign quests to individuals too?").
 */
export function AssignQuestModal({ quest, curricula, classes, orgId, onClose }) {
  const [curriculumId, setCurriculumId] = useState('')
  const [classId, setClassId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [studentPick, setStudentPick] = useState('')
  const [studentIds, setStudentIds] = useState([])
  const addToCurriculumMutation = useAddQuestToCurriculum(orgId)
  const assignToClassMutation = useAssignQuestToClass(orgId)
  const giveToStudentsMutation = useGiveQuestToStudents(orgId)
  const { data: roster = [] } = useSisRoster(orgId)
  // Who already has it, marked in the picker before anyone presses Give
  // (iCreate, ebfc9253, 2026-09-23: "I can't tell if they already have it or
  // not until I enter it in again"). Refreshed after a Give, because the
  // Give hook invalidates the library key this one sits under.
  const { data: holderIds = [] } = useQuestHolders(orgId, quest.id)
  const holders = useMemo(() => new Set(holderIds), [holderIds])
  const studentLabel = (p) => (holders.has(p.student_id) ? `${p.name} (already has it)` : p.name)
  const students = roster.filter((p) => p.is_student)
  const studentOptions = students.filter((p) => !studentIds.includes(p.student_id))
  const studentName = (id) => students.find((p) => p.student_id === id)?.name || 'Student'

  const pickStudent = (id) => {
    setStudentPick('')
    if (id && !studentIds.includes(id)) setStudentIds((prev) => [...prev, id])
  }

  const giveToStudents = async () => {
    if (!studentIds.length) return
    try {
      const data = await giveToStudentsMutation.mutateAsync({ questId: quest.id, studentIds })
      const n = data?.enrolled ?? 0
      const had = data?.already_had_it ?? 0
      toast.success(n
        ? `Given to ${n} ${n === 1 ? 'student' : 'students'}${had ? ` (${had} already had it)` : ''}`
        : 'They already have it')
      setStudentIds([])
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not give it to those students')
    }
  }

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
        ? `Added to ${name}`
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
            Kept there for classes that join that curriculum later. Classes already on it do not get
            it; to give it to one, use Put it on a class below.
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
            Its students get the quest in their accounts right away. Only this class gets it: the
            curriculum the class follows stays as it is. A due date is optional.
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

        <section>
          <h3 className="text-sm font-semibold text-neutral-900">Give it to a student</h3>
          <p className="text-xs text-neutral-500 mb-2">
            For one student, or a few, with no class in between. It lands in their account like any other quest.
          </p>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <SearchSelect value={studentPick} onChange={pickStudent} options={studentOptions}
                getId={(p) => p.student_id} getLabel={studentLabel}
                placeholder={students.length ? 'Search students…' : 'No students yet'}
                emptyLabel="No student matches" />
            </div>
            <Button size="xs" onClick={giveToStudents}
              disabled={!studentIds.length || giveToStudentsMutation.isPending} className="shrink-0">
              {giveToStudentsMutation.isPending ? 'Giving…' : 'Give'}
            </Button>
          </div>
          {studentIds.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 mt-2" aria-label="Students to give it to">
              {studentIds.map((id) => (
                <li key={id} className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 text-optio-purple text-xs px-2.5 py-1">
                  {studentName(id)}{holders.has(id) ? ' (already has it)' : ''}
                  <button type="button" onClick={() => setStudentIds((prev) => prev.filter((s) => s !== id))}
                    aria-label={`Remove ${studentName(id)}`} className="hover:text-red-600">×</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}

/**
 * The quest's attachments and each task's, one under the other. Shared by the
 * post-create step and the row action so they cannot drift.
 */
export function QuestAttachments({ questId, tasks }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-neutral-500 mb-1">
          Videos, links and files for the whole quest. Anything that belongs to one step goes on that task below.
        </p>
        <QuestResourcesPanel questId={questId} />
      </div>
      {(tasks || []).length > 0 && (
        <div className="space-y-3">
          {tasks.map((t, i) => (
            <div key={t.id} className="rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-medium text-neutral-800">
                <span className="text-neutral-400 mr-1.5">{i + 1}.</span>{t.title}
              </p>
              <QuestResourcesPanel questId={questId} taskId={t.id} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function QuestAttachmentsModal({ quest, onClose }) {
  return (
    <Modal isOpen onClose={onClose} title={`Attachments for “${quest.title}”`} size="md">
      <QuestAttachments questId={quest.id} tasks={quest.tasks} />
      <div className="mt-6 flex justify-end">
        <Button size="xs" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

const SCOPES = [
  ['all', 'All'],
  ['school', 'School library'],
  ['teacher', 'Teacher-made'],
]

const isTeacherMade = (q) => Boolean(q.made_by?.teacher)

function QuestTable({ rows, onAssign, onAttach, onEdit, onDuplicate, duplicatingId }) {
  // Which row's actions menu is open. One kebab per row instead of four links:
  // the links wrapped into a ragged block on every row and read as clutter
  // (owner, 2026-09-22).
  const [menuFor, setMenuFor] = useState(null)
  const closeMenu = useCallback(() => setMenuFor(null), [])
  return (
    // Fixed layout, so the columns divide the width available instead of each
    // demanding what its widest cell wants. With auto layout the class chips
    // and four action links pushed the table off the right of the screen
    // (2026-09-22). Percentages, not pixels, so it follows the window. The
    // actions are one menu now, so their column is narrow.
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full table-fixed text-sm min-w-[56rem]">
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[12%]" />
          <col className="w-[7%]" />
          <col className="w-[18%]" />
          <col className="w-[19%]" />
          <col className="w-[9%]" />
          <col className="w-[5%]" />
        </colgroup>
        <thead className="bg-neutral-50 text-neutral-500 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Quest</th>
            <th className="px-3 py-3 font-medium">Made by</th>
            <th className="px-3 py-3 font-medium">Tasks</th>
            <th className="px-3 py-3 font-medium">On curriculum</th>
            {/* "Assigned to" read as "assigned to the curriculum", which is
                the column beside it ("What if it's not assigned to the
                class?" -- iCreate, 2026-09-22, 3e4c6a0a). It holds classes,
                and a quest in the library belongs to no class until somebody
                puts it in one, which "In classes" says and "Assigned to" did
                not. */}
            <th className="px-3 py-3 font-medium">In classes</th>
            <th className="px-3 py-3 font-medium">Updated</th>
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
              <td className="px-3 py-3 text-neutral-700">
                <div className="truncate" title={q.made_by?.name || 'The school'}>
                  {q.made_by?.name || <span className="text-neutral-400">The school</span>}
                </div>
                {isTeacherMade(q) && (
                  <span className="mt-0.5 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    Teacher
                  </span>
                )}
              </td>
              <td className="px-3 py-3 text-neutral-700">{q.task_count}</td>
              <td className="px-3 py-3">
                <Chips items={q.curricula} labelOf={(c) => c.title}
                  hrefOf={(c) => `/library?tab=curriculum&curriculum=${c.id}`}
                  empty="Not on a curriculum" />
              </td>
              <td className="px-3 py-3">
                <Chips items={q.classes} labelOf={(c) => c.name} empty="No class yet" />
              </td>
              <td className="px-3 py-3 text-neutral-500 text-xs">{when(q.updated_at)}</td>
              <td className="px-3 py-3">
                <div className="flex justify-end">
                  {/* Duplicate is offered on every row, including a shared
                      quest that cannot be edited: duplicating is how a school
                      gets a copy of one it can edit. The menu floats so the
                      table's horizontal scroll does not clip it. */}
                  <PopMenu floating open={menuFor === q.id} onClose={closeMenu} width="w-44"
                    trigger={(
                      <button type="button" onClick={() => setMenuFor(menuFor === q.id ? null : q.id)}
                        aria-haspopup="menu" aria-expanded={menuFor === q.id}
                        aria-label={`Actions for ${q.title}`}
                        disabled={duplicatingId === q.id}
                        className="p-1.5 rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50">
                        <EllipsisVerticalIcon className="w-5 h-5" />
                      </button>
                    )}
                    items={[
                      { label: 'Edit', onClick: () => onEdit(q.id) },
                      { label: 'Assign', onClick: () => onAssign(q.id) },
                      { label: 'Attachments', onClick: () => onAttach(q.id) },
                      { label: duplicatingId === q.id ? 'Copying…' : 'Duplicate',
                        onClick: () => onDuplicate(q.id), disabled: duplicatingId === q.id },
                    ]} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 border-t border-gray-100 text-xs text-neutral-500">
        {rows.length} {rows.length === 1 ? 'quest' : 'quests'}
      </div>
    </div>
  )
}

export default function QuestsPanel() {
  const { orgId } = useSisOrg()
  const { data, isLoading, isError, error } = useSisQuestLibrary(orgId)
  const quests = data?.quests || []
  const curricula = data?.curricula || []
  const classes = data?.classes || []
  const loading = !!orgId && isLoading
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('all')
  const [assigning, setAssigning] = useState(null) // quest id
  const [attaching, setAttaching] = useState(null) // quest id
  const [editing, setEditing] = useState(null) // quest id
  const [duplicatingId, setDuplicatingId] = useState(null)
  const duplicate = useDuplicateLibraryQuest(orgId)

  const onDuplicate = async (questId) => {
    setDuplicatingId(questId)
    try {
      const out = await duplicate.mutateAsync({ questId })
      toast.success(`Copied as “${out.title}”`)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not duplicate that quest')
    } finally {
      setDuplicatingId(null)
    }
  }
  const [adding, setAdding] = useState(false)
  // A draft being resumed: {id, context, target_id}.
  const [resuming, setResuming] = useState(null)
  const refresh = useRefreshAfterQuestEdit(orgId)

  // Filtered here rather than by ?search= so typing does not fire a request
  // per keystroke over a list that fits in one response.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const inScope = quests.filter((qu) => (
      scope === 'all' || (scope === 'teacher') === isTeacherMade(qu)
    ))
    if (!q) return inScope
    return inScope.filter((qu) => (
      `${qu.title} ${qu.description || ''} ${qu.made_by?.name || ''} `
      + `${(qu.curricula || []).map((c) => c.title).join(' ')} `
      + `${(qu.classes || []).map((c) => c.name).join(' ')}`
    ).toLowerCase().includes(q))
  }, [quests, search, scope])

  // With no filter the two libraries read as two lists, the office's first.
  // A school with no teacher-made quests yet sees one list and no empty
  // heading; the filter is how to ask for the other half on purpose.
  const sections = useMemo(() => {
    if (scope !== 'all') return [[SCOPES.find(([k]) => k === scope)[1], rows]]
    const school = rows.filter((q) => !isTeacherMade(q))
    const teacher = rows.filter(isTeacherMade)
    if (!teacher.length) return [[null, school]]
    return [['School library', school], ['Teacher-made', teacher]].filter(([, r]) => r.length)
  }, [rows, scope])

  const assigningQuest = assigning ? quests.find((q) => q.id === assigning) : null
  const attachingQuest = attaching ? quests.find((q) => q.id === attaching) : null
  const editingQuest = editing ? quests.find((q) => q.id === editing) : null

  return (
    <div>
      <p className="text-sm text-neutral-500 mb-6">
        Every quest your school has made, wherever it was made. Put one on a curriculum to keep it
        for next term, or assign it straight to a class. Edit changes anything about it: its
        picture, tasks, files and links, and the XP to finish.
        Duplicate copies the whole thing, which is how you change one without changing it for
        everyone already on it.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[14rem] max-w-md">
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quests, authors, curricula or classes…" aria-label="Search quests" />
        </div>
        <div role="group" aria-label="Which library" className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          {SCOPES.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setScope(key)}
              aria-pressed={scope === key}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                scope === key ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-gray-50'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <Button size="xs" onClick={() => setAdding(true)} disabled={adding} className="shrink-0">
          <PlusIcon className="w-4 h-4 mr-1.5" /> Add quest
        </Button>
      </div>

      {adding && (
        <QuestEditor context="library" orgId={orgId} curricula={curricula}
          onDone={refresh} onClose={() => setAdding(false)} />
      )}

      <QuestDraftsList orgId={orgId} context="all" showWhere
        onResume={(d) => setResuming(d)} />
      {resuming && (
        <QuestEditor key={resuming.id} orgId={orgId} questId={resuming.id}
          context={resuming.context || 'library'}
          classId={resuming.context === 'class' ? resuming.target_id : null}
          curriculumId={resuming.context === 'curriculum' ? resuming.target_id : null}
          curricula={curricula}
          onDone={refresh} onClose={() => setResuming(null)} />
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
        <EmptyState plain title={search.trim() ? 'Nothing matches that search' : 'Nothing in this library yet'} />
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-6">
          {sections.map(([heading, sectionRows]) => (
            <section key={heading || 'all'}>
              {heading && (
                <h2 className="text-sm font-semibold text-neutral-900 mb-2">
                  {heading} <span className="font-normal text-neutral-400">({sectionRows.length})</span>
                </h2>
              )}
              <QuestTable rows={sectionRows} onAssign={setAssigning} onAttach={setAttaching}
                onEdit={setEditing} onDuplicate={onDuplicate} duplicatingId={duplicatingId} />
            </section>
          ))}
        </div>
      )}

      {assigningQuest && (
        <AssignQuestModal quest={assigningQuest} curricula={curricula} classes={classes} orgId={orgId}
          onClose={() => setAssigning(null)} />
      )}
      {attachingQuest && (
        <QuestAttachmentsModal quest={attachingQuest} onClose={() => setAttaching(null)} />
      )}
      {editingQuest && (
        <QuestEditor key={editingQuest.id} context="library" orgId={orgId} questId={editingQuest.id}
          inUse={Boolean(editingQuest.curricula?.length || editingQuest.classes?.length)}
          curricula={curricula} onDone={refresh} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
