import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  AcademicCapIcon, CheckCircleIcon, PlusIcon, TrashIcon, ArrowTopRightOnSquareIcon,
  PhotoIcon, EyeIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { switchSurfaceInApp } from '../../utils/appSurface'
import QuestDraftForm, { blankTask } from '../../components/sis/QuestDraftForm'
import QuestAiDraftPanel from '../../components/sis/QuestAiDraftPanel'
import QuestPreviewModal from '../../components/sis/QuestPreviewModal'
import TrainingPeoplePicker from '../../components/sis/TrainingPeoplePicker'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * StaffTrainingPage — the quests a school sets, built out of ordinary quests.
 *
 * Three audiences (iCreate, 2026-08-06: "admin need to be able to create quests
 * for all their teachers and families"):
 *   Teachers  training — the original page.
 *   Families  quests guardians do themselves, e.g. back to school night.
 *   Students  quests the school sets, optionally narrowed by age.
 *
 * The tabs are a filter, not a filing system: one quest can be set for several
 * groups at once — iCreate's orientation quest goes to "12+ students and all
 * parents" (2026-08-17) — and shows on every tab it targets.
 *
 * Teachers see what they need to do and how far they've got; admins also see
 * who has finished what, one group at a time. The content itself is an ordinary
 * quest, so it is written in the normal curriculum editor (videos included) and
 * completed in the web platform — this page is the staff-facing door to it.
 *
 * Families read their own side in the family portal; students just find the
 * quest on their account, which is why the student audience has no page here.
 */

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'

const progressLabel = (p) => {
  if (!p?.started) return 'Not started'
  if (p.completed) return 'Complete'
  if (!p.total) return 'In progress'
  return `${p.done} of ${p.total} tasks`
}

/** "150 of 300 XP" — only where a finish line has actually been set. */
const xpLabel = (item) => {
  const needed = item?.xp_threshold || 0
  if (!needed) return null
  return `${item.my_progress?.earned_xp || 0} of ${needed} XP`
}

const xpStyle = (item) => {
  const needed = item?.xp_threshold || 0
  const earned = item?.my_progress?.earned_xp || 0
  return earned >= needed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-neutral-600'
}

const progressStyle = (p) => {
  if (!p?.started) return 'bg-gray-100 text-neutral-500'
  if (p.completed) return 'bg-green-100 text-green-700'
  return 'bg-amber-100 text-amber-800'
}

/** What each tab calls the people on it, in the few places copy needs it. */
const AUDIENCE_WORDS = {
  // `joiners` is who arrives later, which is not always the plural of `one`:
  // people join a school as staff, not as "people".
  staff: { one: 'person', many: 'people', joiners: 'staff',
    quests: 'training quests', add: 'Add training' },
  family: { one: 'family', many: 'families', joiners: 'families',
    quests: 'family quests', add: 'Add a family quest' },
  student: { one: 'student', many: 'students', joiners: 'students',
    quests: 'student quests', add: 'Add a student quest' },
}
const words = (audience) => AUDIENCE_WORDS[audience] || AUDIENCE_WORDS.staff

const people = (n, audience) => {
  const { one, many } = words(audience)
  return `${n} ${n === 1 ? one : many}`
}

/**
 * "1 family's account", "2 families' accounts", "3 people's accounts".
 *
 * The possessive cannot be tacked onto the plural: "families" already ends in
 * s and takes a bare apostrophe, while "people" does not and takes 's. Gluing
 * "'s" on regardless produced "2 families's accounts".
 */
const accountsOf = (n, audience) => {
  const { one, many } = words(audience)
  if (n === 1) return `${n} ${one}'s account`
  return `${n} ${many}${many.endsWith('s') ? "'" : "'s"} accounts`
}

/** "Added to training. Now on 22 people's accounts." */
const assignedMessage = (assigned, audience, base) => {
  if (!assigned) return base
  const { enrolled = 0, already = 0 } = assigned
  const total = enrolled + already
  if (!total) return `${base} Nobody to assign it to yet.`
  if (!enrolled) return `${base} ${people(already, audience)} already had it.`
  return `${base} Now on ${accountsOf(enrolled, audience)}${already ? `, ${already} already had it` : ''}.`
}

const AddTraining = ({ orgId, audience, onAdded, onCancel, orgLogo = null, editItem = null }) => {
  const [options, setOptions] = useState([])
  const [questId, setQuestId] = useState('')
  const [category, setCategory] = useState('')
  const [required, setRequired] = useState(false)
  // On by default: somebody setting a quest for their whole school almost always
  // means "put it on their accounts", and the alternative is a quest nobody can
  // find. Untick it for something optional people opt into.
  const [autoAssign, setAutoAssign] = useState(true)
  // The finish line (quests.xp_threshold, enforced by the ordinary end-quest
  // route). It defaults to "all of it" — the sum of the task XP — and follows
  // the tasks as they are edited or regenerated, until an admin types their own
  // number. After that it is theirs and stops moving underneath them.
  const [xpThreshold, setXpThreshold] = useState('')
  const [xpEdited, setXpEdited] = useState(false)
  const [roles, setRoles] = useState([])
  // Who the quest is for. A set, not a value: iCreate's orientation quest goes
  // to "12+ students and all parents" (2026-08-17), which one audience could
  // not say. Starts as the tab it was opened from, so the common case of
  // "a quest for the group I am looking at" needs no thought.
  const [targets, setTargets] = useState([audience])
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const toggleTarget = (value) => setTargets((ts) => (
    ts.includes(value)
      // Never leave it aimed at nobody — the last one ticked stays ticked.
      ? (ts.length > 1 ? ts.filter((t) => t !== value) : ts)
      : [...ts, value]))
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  // Uploaded as soon as it is chosen, so the preview can show the real picture
  // before the quest is committed to. Blank means the backend picks a stock
  // image from the title.
  const [imageUrl, setImageUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const imageRef = useRef(null)
  // Off by default: training is a set list of things the school needs done, so
  // people writing their own extra tasks is the exception, not the norm.
  const [ownTasks, setOwnTasks] = useState(false)
  // What the draft was generated from, kept only so those learner-written tasks
  // can be about the actual handbook.
  const [sourceMaterial, setSourceMaterial] = useState('')

  const pickImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Choose an image file'); return }
    setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post(withOrg('/api/sis/training/header-image', orgId), fd,
        { headers: { 'Content-Type': 'multipart/form-data' } })
      setImageUrl(res.data?.url || '')
      toast.success('Header image ready')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not upload that image')
    } finally {
      setUploadingImage(false)
      if (imageRef.current) imageRef.current.value = ''
    }
  }
  const toggleRole = (value) => setRoles((rs) =>
    rs.includes(value) ? rs.filter((r) => r !== value) : [...rs, value])

  // "Where does the quest get built?" (iCreate, 2026-08-06). Attaching an
  // existing quest is a dead end if you have not made one, and sending somebody
  // to the learning app to author one and come back is not a flow people
  // finish. Both doors, same panel.
  const [tab, setTab] = useState('existing') // existing | new
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tasks, setTasks] = useState([blankTask()])

  // Everything the quest is worth. "Do all of it" is the sensible default for
  // training, and it is what an admin would otherwise add up by hand.
  const taskXpTotal = tasks.reduce(
    (sum, t) => sum + (t.title.trim() ? Number(t.xp_value) || 0 : 0), 0)
  const xpValue = xpEdited ? xpThreshold : (taskXpTotal ? String(taskXpTotal) : '')
  const xpToSend = xpValue === '' ? null : Number(xpValue)

  useEffect(() => {
    if (!orgId || editItem) return
    // Training content is an ordinary quest — the school's own, or the library.
    api.get(`${withOrg('/api/sis/training/assignable-quests', orgId)}&audience=${audience}`)
      .then((r) => setOptions(r.data?.quests || []))
      .catch(() => setOptions([]))
  }, [orgId, audience, editItem])

  // Reopening a quest for more work. A draft you cannot pick back up is not a
  // draft, it is a dead end.
  const [loadingEdit, setLoadingEdit] = useState(!!editItem)
  useEffect(() => {
    if (!editItem) return
    setLoadingEdit(true)
    api.get(withOrg(`/api/sis/training/${editItem.id}/quest`, orgId))
      .then((r) => {
        const q = r.data?.quest || {}
        const cat = r.data?.training || {}
        setTab('new')
        setTitle(q.title || '')
        setDescription(q.description || '')
        setTasks((q.tasks || []).length
          ? q.tasks.map((t) => ({ ...blankTask(), ...t }))
          : [blankTask()])
        setImageUrl(q.image_url || '')
        setOwnTasks(!!q.allow_custom_tasks)
        // The finish line was already decided once; typing over the tasks now
        // must not silently move it.
        setXpThreshold(q.xp_threshold ? String(q.xp_threshold) : '')
        setXpEdited(true)
        setCategory(cat.category || '')
        setRequired(!!cat.is_required)
        setAutoAssign(!!cat.auto_assign)
        setRoles(cat.visible_to_roles || [])
        setTargets(cat.audiences?.length ? cat.audiences : [cat.audience || audience])
        setMinAge(cat.student_min_age == null ? '' : String(cat.student_min_age))
        setMaxAge(cat.student_max_age == null ? '' : String(cat.student_max_age))
      })
      .catch(() => toast.error('Could not load that quest'))
      .finally(() => setLoadingEdit(false))
  }, [editItem, orgId])

  // Who it is for, in the shape all three save paths send. The age window is
  // only meaningful with students ticked, and is sent as null rather than
  // omitted so unticking students actually clears it.
  const audienceFields = () => ({
    audiences: targets,
    student_min_age: targets.includes('student') && minAge !== '' ? Number(minAge) : null,
    student_max_age: targets.includes('student') && maxAge !== '' ? Number(maxAge) : null,
  })

  const saveEdits = async () => {
    if (!title.trim()) { toast.error('Give the quest a title'); return }
    setBusy(true)
    try {
      await api.put(withOrg(`/api/sis/training/${editItem.id}/quest`, orgId), {
        title: title.trim(), description: description.trim(),
        tasks: tasks.filter((t) => t.title.trim()),
        image_url: imageUrl || undefined,
        xp_threshold: xpToSend,
        allow_custom_tasks: ownTasks,
        source_material: ownTasks ? sourceMaterial : undefined,
        category: category.trim(), is_required: required,
        auto_assign: autoAssign,
        visible_to_roles: roles.length ? roles : undefined,
        ...audienceFields(),
      })
      toast.success('Changes saved')
      onAdded()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the changes')
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    if (!questId) { toast.error('Pick a quest'); return }
    setBusy(true)
    try {
      const res = await api.post('/api/sis/training', {
        organization_id: orgId, quest_id: questId, audience,
        category: category.trim(), is_required: required,
        auto_assign: autoAssign, xp_threshold: xpToSend,
        visible_to_roles: roles.length ? roles : undefined,
        ...audienceFields(),
      })
      toast.success(assignedMessage(res.data?.assigned, audience,
        audience === 'family' ? 'Set for families'
          : audience === 'student' ? 'Set for students' : 'Added to training'))
      onAdded()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add it')
    } finally {
      setBusy(false)
    }
  }

  const createAndAdd = async (asDraft = false) => {
    if (!title.trim()) { toast.error('Give the quest a title'); return }
    setBusy(true)
    try {
      const res = await api.post('/api/sis/training/create', {
        is_draft: asDraft,
        organization_id: orgId, audience,
        title: title.trim(), description: description.trim(),
        tasks: tasks.filter((t) => t.title.trim()),
        image_url: imageUrl || undefined,
        allow_custom_tasks: ownTasks,
        source_material: ownTasks ? sourceMaterial : undefined,
        category: category.trim(), is_required: required,
        auto_assign: autoAssign, xp_threshold: xpToSend,
        visible_to_roles: roles.length ? roles : undefined,
        ...audienceFields(),
      })
      toast.success(asDraft
        ? 'Saved as a draft. Nobody can see it until you publish it.'
        : assignedMessage(res.data?.assigned, audience,
          audience === 'family' ? 'Quest built and set for families'
            : audience === 'student' ? 'Quest built and set for students' : 'Quest built and added'))
      onAdded()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not build the quest')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-optio-purple/30 rounded-xl p-4 space-y-3 bg-optio-purple/5 mb-6">
      <p className="text-sm text-neutral-600">
        {editItem
          ? 'Editing this quest. Changes apply to anyone who starts it from now on \u2014 tasks already on somebody\u2019s account are their work and are left alone.'
          : audience === 'family'
            ? 'A family quest is an ordinary quest \u2014 parents complete it on their own account. Attach one you already have, or build it here.'
            : audience === 'student'
              ? 'A student quest is an ordinary quest, set by the school rather than chosen. Attach one you already have, or build it here.'
              : 'Training is a quest. Attach one you already have, or build it here.'}
      </p>
      {/* Two doors: attach one that exists, or build one here. Editing has only
          the one door \u2014 the quest already exists and is being rewritten. */}
      <div className={`flex gap-1 border-b border-gray-200 ${editItem ? 'hidden' : ''}`}>
        {[['existing', 'Use an existing quest'], ['new', 'Build a new one']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === k ? 'border-optio-purple text-optio-purple' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'existing' ? (
        /* Grouped by where the quest came from and alphabetical inside each
           group — a flat list in storage order is unsearchable once a school
           has a few dozen (iCreate, 2026-08-19). The API sorts; this names the
           groups. */
        <select value={questId} onChange={(e) => setQuestId(e.target.value)} className={inputClass}
          aria-label="Choose a quest">
          <option value="">Choose a quest…</option>
          {[['organization', "Your school's quests"], ['library', 'Optio library']].map(
            ([source, groupLabel]) => {
              const group = options.filter((q) => q.source === source)
              if (!group.length) return null
              return (
                <optgroup key={source} label={groupLabel}>
                  {group.map((q) => (
                    <option key={q.quest_id} value={q.quest_id}>{q.title}</option>
                  ))}
                </optgroup>
              )
            })}
        </select>
      ) : (
        <div className="space-y-3">
          {/* Orientation and training already exist as a handbook. Upload it and
              the quest is drafted from it, rather than retyped from it.
              Only when building: reopening a finished quest is about changing
              its details, and a panel whose job is to overwrite the whole form
              is the last thing wanted there. */}
          {!editItem && (
            <QuestAiDraftPanel
              alwaysOpen
              hasDraft={Boolean(title.trim() || description.trim() || tasks.some((t) => t.title.trim()))}
              onDrafted={(d) => {
                setTitle(d.title); setDescription(d.description); setTasks(d.tasks)
                setSourceMaterial(d.sourceMaterial || '')
              }}
            />
          )}
          {/* Header image. The first thing anybody sees when they open the
              quest, so it is offered here rather than left to a stock search. */}
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="w-24 h-16 rounded-lg object-cover border border-gray-200" />
            ) : orgLogo ? (
              <img src={orgLogo} alt="" className="w-24 h-16 rounded-lg object-contain bg-white border border-gray-200 p-1" />
            ) : (
              <div className="w-24 h-16 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
                <PhotoIcon className="w-5 h-5 text-white/80" />
              </div>
            )}
            <div className="flex-1">
              <input ref={imageRef} type="file" accept="image/*" onChange={pickImage}
                className="hidden" aria-label="Upload a header image" />
              <div className="flex items-center gap-2">
                <button type="button" disabled={uploadingImage}
                  onClick={() => imageRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-neutral-700 hover:bg-gray-50 disabled:opacity-50">
                  {uploadingImage ? 'Uploading…' : imageUrl ? 'Change image' : 'Upload header image'}
                </button>
                {imageUrl && (
                  <button type="button" onClick={() => setImageUrl('')}
                    className="text-xs text-neutral-500 hover:underline">Remove</button>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {imageUrl ? 'Shown across the top of the quest.'
                  : orgLogo ? 'Your school logo is used unless you upload something else.'
                    : 'Optional — without one we find a stock image from the title.'}
              </p>
            </div>
          </div>
          {/* Pillars are shown here even though the learner's own page hides
              them on a training quest (QuestDetail, quest.is_training). The
              chip is noise to somebody doing back-to-school night; the stored
              value is not, because it decides which pillar the XP lands in.
              Left hidden, every task typed by hand kept blankTask()'s default
              — ten of iCreate's sixteen orientation tasks are filed under Art,
              including "Find the Absences feature in Optio". An admin asked to
              be able to edit every part of the quest, and this is a part. */}
          <QuestDraftForm
          title={title} setTitle={setTitle}
          description={description} setDescription={setDescription}
          tasks={tasks} setTasks={setTasks}
          titlePlaceholder={audience === 'family' ? 'Quest title (e.g. Back to school night)'
            : audience === 'student' ? 'Quest title (e.g. Welcome to iCreate)'
              : 'Quest title (e.g. Classroom management)'}
          descriptionPlaceholder={audience === 'family' ? 'What are families doing?'
            : audience === 'student' ? 'What are students doing?' : 'What are teachers learning?'}
          taskHint={'Preset tasks are copied to each person when they start the quest. '
            + 'Leave it empty and they write their own.'}
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={category} onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (e.g. Onboarding, Classroom management)" className={inputClass} />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required for everyone it goes to
        </label>
        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <span className="shrink-0 pt-2">XP to finish</span>
          <span className="flex-1">
            <span className="flex items-center gap-2">
              <input type="number" min={0} step={25} value={xpValue}
                onChange={(e) => { setXpEdited(true); setXpThreshold(e.target.value) }}
                placeholder="Any amount" aria-label="XP required to finish"
                className={inputClass} />
              {xpEdited && taskXpTotal > 0 && Number(xpValue || 0) !== taskXpTotal && (
                <button type="button"
                  onClick={() => { setXpEdited(false); setXpThreshold('') }}
                  className="shrink-0 text-xs text-optio-purple hover:underline">
                  Use all {taskXpTotal}
                </button>
              )}
            </span>
            <span className="block text-xs text-neutral-500 mt-1">
              {xpEdited
                ? 'They must earn this much before the quest will close. Clear it and finishing is never blocked.'
                : `Every task adds up to ${taskXpTotal || 0} XP, so they have to do all of it. Type your own number to ask for less.`}
            </span>
          </span>
        </label>
        <label className="sm:col-span-2 flex items-start gap-2 text-sm text-neutral-700">
          <input type="checkbox" className="mt-0.5" checked={ownTasks}
            onChange={(e) => setOwnTasks(e.target.checked)} />
          <span>
            Let them add tasks of their own
            <span className="block text-xs text-neutral-500">
              {sourceMaterial
                ? 'They can generate extra tasks for themselves, written from the document you uploaded.'
                : 'They can generate extra tasks for themselves, alongside the ones you set. Build the quest from a document and those tasks are written from it.'}
            </span>
          </span>
        </label>
        <label className="sm:col-span-2 flex items-start gap-2 text-sm text-neutral-700">
          <input type="checkbox" className="mt-0.5" checked={autoAssign}
            onChange={(e) => setAutoAssign(e.target.checked)} />
          <span>
            Put it on their accounts
            <span className="block text-xs text-neutral-500">
              Everyone it goes to gets the quest now, and anyone who joins later gets it
              too. Untick to let them find it themselves.
            </span>
          </span>
        </label>
        {/* Who it goes to. Several groups at once, because a school's
            orientation quest is one quest whether the parents or the teenagers
            are doing it (iCreate, 2026-08-17). */}
        <div className="sm:col-span-2 border-t border-gray-200 pt-3">
          <span className="block text-xs text-neutral-500 mb-1.5">Who gets this quest</span>
          <div className="flex flex-wrap items-center gap-4">
            {[['staff', 'Staff'], ['family', 'Parents'], ['student', 'Students']].map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm text-neutral-700">
                <input type="checkbox" checked={targets.includes(value)}
                  onChange={() => toggleTarget(value)} />
                {label}
              </label>
            ))}
          </div>
          {targets.includes('student') && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-700">
              <span className="text-xs text-neutral-500">Students aged</span>
              <input type="number" min={0} max={120} value={minAge}
                onChange={(e) => setMinAge(e.target.value)}
                placeholder="any" aria-label="Youngest student age"
                className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
              <span className="text-xs text-neutral-500">to</span>
              <input type="number" min={0} max={120} value={maxAge}
                onChange={(e) => setMaxAge(e.target.value)}
                placeholder="any" aria-label="Oldest student age"
                className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
              <span className="block w-full text-xs text-neutral-500 mt-1">
                {minAge || maxAge
                  ? 'A student with no date of birth on file is left out, so check their record if somebody is missing.'
                  : 'Leave both blank for every student. Fill in the first for "12 and up".'}
              </span>
            </div>
          )}
          {targets.includes('staff') && (
            <div className="mt-3 text-xs text-neutral-500">
              <span className="block mb-1">Which staff roles <span className="text-neutral-400">(none ticked = all staff)</span></span>
              <div className="flex items-center gap-3">
                {[['org_admin', 'Admins'], ['campus_coordinator', 'Coordinators'], ['advisor', 'Teachers']].map(([value, label]) => (
                  <label key={value} className="flex items-center gap-1.5 text-sm text-neutral-700">
                    <input type="checkbox" checked={roles.includes(value)} onChange={() => toggleRole(value)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
        {tab === 'new' && (
          <button onClick={() => setPreviewing(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-neutral-700 hover:bg-gray-50">
            <EyeIcon className="w-4 h-4" /> Preview quest
          </button>
        )}
        {tab === 'existing' ? (
          <button onClick={add} disabled={busy || !questId}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Adding…' : 'Add training'}
          </button>
        ) : editItem ? (
          <button onClick={saveEdits} disabled={busy || loadingEdit || !title.trim()}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        ) : (
          <>
            {/* Build it now, decide who gets it later. */}
            <button onClick={() => createAndAdd(true)} disabled={busy || !title.trim()}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-neutral-700 hover:bg-gray-50 disabled:opacity-50">
              {busy ? 'Saving…' : 'Save as draft'}
            </button>
            <button onClick={() => createAndAdd(false)} disabled={busy || !title.trim()}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Building…' : 'Build and add'}
            </button>
          </>
        )}
      </div>

      <QuestPreviewModal
        open={previewing} onClose={() => setPreviewing(false)}
        title={title} description={description} tasks={tasks}
        imageUrl={imageUrl || orgLogo} containImage={!imageUrl && !!orgLogo}
        xpThreshold={xpToSend} audience={audience} allowOwnTasks={ownTasks}
      />
    </div>
  )
}

const StaffTrainingPage = () => {
  const confirm = useConfirm()
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin, activeOrg } = useSisOrg()
  // The default header image, so the builder and the preview show what will
  // actually be used rather than a placeholder.
  const orgLogo = activeOrg?.branding_config?.logo_url || null
  const admin = isSisAdmin(user)
  const [training, setTraining] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [view, setView] = useState('mine') // mine | everyone
  // Which group's quests are being looked at. Teachers only ever have one, so
  // the switch is admin-only and 'staff' stays the default everywhere.
  const [audience, setAudience] = useState('staff')

  const load = useCallback(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    api.get(`${withOrg('/api/sis/training', orgId)}&audience=${audience}`)
      .then((r) => setTraining(r.data?.training || []))
      .catch(() => toast.error('Failed to load the quests'))
      .finally(() => setLoading(false))
    if (admin) {
      api.get(`${withOrg('/api/sis/training/progress', orgId)}&audience=${audience}`)
        .then((r) => setReport(r.data))
        .catch(() => setReport(null))
    }
  }, [orgId, admin, audience])

  useEffect(() => { load() }, [load])

  // Idempotent on the backend, so it is safe to press again next week to catch
  // whoever has joined since.
  const [assigning, setAssigning] = useState(null)
  const [picking, setPicking] = useState(null)
  const [editing, setEditing] = useState(null)
  const assign = async (t) => {
    setAssigning(t.id)
    try {
      const res = await api.post(withOrg(`/api/sis/training/${t.id}/assign`, orgId), {})
      // The row's own audience, not the page toggle — they can differ.
      toast.success(assignedMessage(res.data, res.data?.audience || t.audience || audience,
        `"${t.title}" assigned.`))
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not assign it')
    } finally {
      setAssigning(null)
    }
  }

  // The finish line is a column on the quest, so it is editable after the fact
  // without rebuilding anything — an admin who set it too high on Monday moves
  // it on Tuesday.
  const saveXp = async (t, value) => {
    const next = value === '' ? null : Number(value)
    if ((t.xp_threshold || 0) === (next || 0)) return
    try {
      await api.patch(withOrg(`/api/sis/training/${t.id}`, orgId), { xp_threshold: next })
      toast.success(next ? `Finish line set to ${next} XP` : 'XP requirement removed')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the XP requirement')
      load()
    }
  }

  const publish = async (t) => {
    try {
      const res = await api.post(withOrg(`/api/sis/training/${t.id}/publish`, orgId), {})
      toast.success(assignedMessage(res.data?.assigned, t.audience || audience,
        `"${t.title}" published.`))
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not publish it')
    }
  }

  const remove = async (t) => {
    if (!(await confirm(`Remove "${t.title}" from training? The quest itself is kept.`))) return
    try {
      await api.delete(withOrg(`/api/sis/training/${t.id}`, orgId))
      toast.success('Removed from training')
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove it')
    }
  }

  const grouped = useMemo(() => training.reduce((acc, t) => {
    const key = t.category || 'General'
    ;(acc[key] = acc[key] || []).push(t)
    return acc
  }, {}), [training])

  const mine = useMemo(() => {
    const req = training.filter((t) => t.is_required)
    return {
      requiredTotal: req.length,
      requiredDone: req.filter((t) => t.my_progress?.completed).length,
    }
  }, [training])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-neutral-900">Training</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        {admin
          ? 'Quests your school sets for its teachers and its families. Open one to start it on the web platform \u2014 progress shows up here automatically.'
          : 'Quests to work through at your own pace. Open one to start it on the web platform \u2014 your progress shows up here automatically.'}
      </p>

      {/* Audience switch. Families read their own side in the family portal;
          this is where an admin decides what is on it. */}
      {admin && (
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white mb-4">
          {[['staff', 'For teachers'], ['family', 'For families'],
            ['student', 'For students']].map(([key, label]) => (
            <button key={key} onClick={() => { setAudience(key); setAdding(false) }}
              aria-pressed={audience === key}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                audience === key ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {mine.requiredTotal > 0 && (
        <div className={`rounded-xl border p-4 mb-6 ${
          mine.requiredDone === mine.requiredTotal
            ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className={`text-sm font-medium ${
            mine.requiredDone === mine.requiredTotal ? 'text-green-800' : 'text-amber-900'}`}>
            {mine.requiredDone === mine.requiredTotal
              ? 'All required training complete.'
              : `${mine.requiredDone} of ${mine.requiredTotal} required quests complete.`}
          </p>
        </div>
      )}

      {admin && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
            {[['mine', 'The quests'],
              ['everyone', 'Who has done what']].map(([key, label]) => (
              <button key={key} onClick={() => setView(key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === key ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>
                {label}
              </button>
            ))}
          </div>
          {!adding && view === 'mine' && (
            <button onClick={() => setAdding(true)}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold">
              <PlusIcon className="w-4 h-4" /> {words(audience).add}
            </button>
          )}
        </div>
      )}

      {adding && <AddTraining orgId={orgId} audience={audience} orgLogo={orgLogo}
        onAdded={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />}

      {editing && <AddTraining key={editing.id} orgId={orgId} audience={audience}
        orgLogo={orgLogo} editItem={editing}
        onAdded={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />}

      {loading && <p className="text-neutral-500">Loading…</p>}

      {!loading && !training.length && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <AcademicCapIcon className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm text-neutral-600 font-medium">
            No {words(audience).quests} yet.
          </p>
          {admin && <p className="text-sm text-neutral-500 mt-1">Build a quest, then add it here.</p>}
        </div>
      )}

      {!loading && view === 'mine' && Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="mb-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">{category}</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {items.map((t) => (
              <div key={t.id} className="p-4 flex items-start gap-3">
                {t.my_progress?.completed
                  ? <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  : <AcademicCapIcon className="w-5 h-5 text-optio-purple shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-neutral-900">{t.title}</span>
                    {t.is_required && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple">Required</span>
                    )}
                    {t.is_draft && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                        title="Only admins can see this">Draft</span>
                    )}
                    {/* "On everyone's accounts" read as a claim that it was
                        already live for everyone. It is a setting, not a state:
                        what it means is that new arrivals get it too. */}
                    {admin && t.auto_assign && !t.is_draft && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700"
                        title={`Any ${words(audience).one} who joins later gets this automatically`}>
                        Auto-assigns to new {words(audience).joiners}
                      </span>
                    )}
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${progressStyle(t.my_progress)}`}>
                      {progressLabel(t.my_progress)}
                    </span>
                    {xpLabel(t) && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${xpStyle(t)}`}>
                        {xpLabel(t)}
                      </span>
                    )}
                  </div>
                  {t.description && <p className="text-sm text-neutral-500 mt-0.5 line-clamp-2">{t.description}</p>}
                  {admin && t.quest_is_ours && (
                    <label className="flex items-center gap-2 text-xs text-neutral-500 mt-1.5">
                      XP to finish
                      <input type="number" min={0} step={25} defaultValue={t.xp_threshold || ''}
                        onBlur={(e) => saveXp(t, e.target.value)}
                        placeholder="Any"
                        aria-label={`XP required to finish ${t.title}`}
                        className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-xs" />
                    </label>
                  )}
                  <button
                    onClick={() => switchSurfaceInApp('learning', `/quests/${t.quest_id}`)}
                    className="inline-flex items-center gap-1.5 text-sm text-optio-purple hover:underline mt-1"
                  >
                    {t.my_progress?.started ? 'Continue' : 'Start this Quest'}
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                {admin && (
                  <div className="flex items-center gap-1 shrink-0">
                    {/* A quest built here can be picked back up; a library one
                        belongs to every school, so it is not ours to rewrite. */}
                    {t.quest_is_ours && (
                      <button onClick={() => setEditing(t)}
                        className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-neutral-700 hover:bg-gray-50">
                        Edit
                      </button>
                    )}
                    <button onClick={() => setPicking(t)}
                      className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-neutral-700 hover:bg-gray-50">
                      Choose people
                    </button>
                    {t.is_draft ? (
                      <button onClick={() => publish(t)}
                        className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs font-semibold">
                        Publish
                      </button>
                    ) : (
                      <button onClick={() => assign(t)} disabled={assigning === t.id}
                        className="px-2.5 py-1 rounded-lg border border-gray-300 text-xs font-medium text-neutral-700 hover:bg-gray-50 disabled:opacity-50">
                        {assigning === t.id ? 'Assigning…' : 'Assign to everyone'}
                      </button>
                    )}
                    <button onClick={() => remove(t)} className="p-1.5 text-gray-400 hover:text-red-500"
                      aria-label={`Remove ${t.title}`}>
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {!loading && view === 'everyone' && admin && (
        !report?.staff?.length
          ? <p className="text-neutral-500">No {words(audience).many} to report on yet.</p> : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
        <th className="text-left px-4 py-2.5 font-semibold text-neutral-700">
                    {audience === 'family' ? 'Family' : audience === 'student' ? 'Student' : 'Staff'}
                  </th>
                  {(report.training || []).map((t) => (
                    <th key={t.quest_id} className="px-3 py-2.5 font-medium text-neutral-600 min-w-[7rem]">
                      <span className="block truncate max-w-[10rem] mx-auto" title={t.title}>{t.title}</span>
                      {t.is_required && <span className="block text-[11px] font-normal text-optio-purple">required</span>}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 font-medium text-neutral-600">Required done</th>
                </tr>
              </thead>
              <tbody>
                {report.staff.map((s) => (
                  <tr key={s.user_id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-neutral-900">{s.name}</td>
                    {s.cells.map((c) => (
                      <td key={c.quest_id} className="px-3 py-2.5 text-center">
                        <span className={`inline-block px-2 py-1 rounded-md text-xs ${progressStyle(c)}`}>
                          {progressLabel(c)}
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-center text-neutral-600">
                      {s.required_completed}<span className="text-neutral-400">/{report.required_total}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {picking && (
        <TrainingPeoplePicker
          item={picking} orgId={orgId}
          onClose={() => setPicking(null)}
          onAssigned={(result) => {
            toast.success(assignedMessage(result, picking.audience || audience,
              `"${picking.title}" assigned.`))
            setPicking(null)
            load()
          }}
        />
      )}
    </div>
  )
}

export default StaffTrainingPage
