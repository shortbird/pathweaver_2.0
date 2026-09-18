import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PhotoIcon, EyeIcon } from '@heroicons/react/24/outline'
import SearchSelect from '../ui/SearchSelect'
import { Input, Textarea } from '../ui/Input'
import GlassTabBar from '../ui/GlassTabBar'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import QuestDraftForm, { blankTask } from './QuestDraftForm'
import QuestAiDraftPanel from './QuestAiDraftPanel'
import QuestPreviewModal from './QuestPreviewModal'
import { useSisStaff } from '../../hooks/api/useSisStaff'
import { useSaveTrainingLink } from '../../hooks/api/useTraining'
import { assignedMessage } from '../../pages/sis/trainingCopy'

/**
 * The one form for adding or editing a training, whatever shape it takes.
 *
 * Three doors for staff: attach an existing quest, build a new one, or link to
 * a video or document. Families and students get the two quest doors. Until
 * M18 (2026-09-17) the link door was a second form in a second file with its
 * own targeting block and its own save path; now every kind shares the
 * category, the required flag and one "who is this for" (roles OR named
 * people), and the kind only decides which fields sit above them.
 *
 * "Where does the quest get built?" (iCreate, 2026-08-06): attaching an
 * existing quest is a dead end if you have not made one, and sending somebody
 * to the learning app to author one and come back is not a flow people
 * finish. Both doors, same panel. iCreate, 2026-09-15: "the ability to add
 * training as links and not just as new quests" -- the third door.
 */

const STAFF_ROLE_OPTIONS = [['org_admin', 'Admins'], ['campus_coordinator', 'Coordinators'], ['advisor', 'Teachers']]

export default function TrainingForm({ orgId, audience, onAdded, onCancel, orgLogo = null, editItem = null }) {
  const editingLink = editItem?.kind === 'link'
  const [options, setOptions] = useState([])
  const [questId, setQuestId] = useState('')
  // The Optio library is 168 quests to the school's few dozen. Off by default
  // the picker is the school's own list; on, the library joins it, each entry
  // saying where it came from.
  const [includeLibrary, setIncludeLibrary] = useState(false)
  const [category, setCategory] = useState(editItem?.kind === 'link' ? (editItem.category || '') : '')
  const [required, setRequired] = useState(editItem?.kind === 'link' ? !!editItem.is_required : false)
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
  const [roles, setRoles] = useState(editingLink ? (editItem.visible_to_roles || []) : [])
  // Named people, ORed with the roles: "some trainings are general and others
  // are specific to certain teachers or staff" (iCreate, 2026-09-15). The
  // same pair a link and a quest both carry since M18.
  const [people, setPeople] = useState(editingLink ? (editItem.visible_to_user_ids || []) : [])
  // Who a training can be aimed at by name. The form is admin-only, so this
  // read never runs for a teacher (who would 403 on it).
  const { data: staff = [] } = useSisStaff(orgId)
  const nameOf = (id) => staff.find((p) => p.id === id)?.name || 'Someone'
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
  const [tab, setTab] = useState(editingLink ? 'link' : 'existing') // existing | new | link
  const [title, setTitle] = useState(editingLink ? (editItem.title || '') : '')
  const [description, setDescription] = useState(editingLink ? (editItem.description || '') : '')
  const [tasks, setTasks] = useState([blankTask()])
  // The link kind: a video, a document, a slide deck. Open it, press done.
  const [url, setUrl] = useState(editingLink ? (editItem.url || '') : '')
  const saveLink = useSaveTrainingLink(orgId)

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
  const [loadingEdit, setLoadingEdit] = useState(!!editItem && !editingLink)
  useEffect(() => {
    if (!editItem || editItem.kind === 'link') return
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
        setPeople(cat.visible_to_user_ids || [])
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
        visible_to_user_ids: people.length ? people : undefined,
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
        visible_to_user_ids: people.length ? people : undefined,
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
        visible_to_user_ids: people.length ? people : undefined,
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

  const addLink = async () => {
    if (!title.trim()) { toast.error('Give the training a title'); return }
    if (!url.trim()) { toast.error('Paste the link to the training'); return }
    try {
      await saveLink.mutateAsync({ id: editingLink ? editItem.id : undefined, body: {
        title: title.trim(), url: url.trim(), description: description.trim(),
        category: category.trim(), is_required: required,
        visible_to_roles: roles, visible_to_user_ids: people,
      } })
      toast.success(editingLink ? 'Changes saved' : 'Added to training')
      onAdded()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the link')
    }
  }

  // Three doors for staff: attach a quest, build one, or link to a video or
  // document. Families and students get the two quest doors; a link for them
  // has no portal to be done on. Editing has one door — the thing already
  // exists and is being rewritten.
  const doors = [['existing', 'Use an existing quest'], ['new', 'Build a new one'],
    ...(audience === 'staff' ? [['link', 'Link to a video or document']] : [])]
  const header = (
    <>
      <p className="text-sm text-neutral-600">
        {editingLink
          ? 'Editing this link.'
          : editItem
          ? 'Editing this quest. Changes apply to anyone who starts it from now on \u2014 tasks already on somebody\u2019s account are their work and are left alone.'
          : audience === 'family'
            ? 'A family quest is an ordinary quest \u2014 parents complete it on their own account. Attach one you already have, or build it here.'
            : audience === 'student'
              ? 'A student quest is an ordinary quest, set by the school rather than chosen. Attach one you already have, or build it here.'
              : 'Training is a quest or a link. Attach a quest you already have, build one here, or link to a video or document.'}
      </p>
      {!editItem && (
        <GlassTabBar
          align="start" aria-label="How to add training"
          tabs={doors.map(([id, label]) => ({ id, label }))}
          active={tab} onSelect={setTab}
        />
      )}
    </>
  )

  const isLink = tab === 'link'

  return (
    <div className="border border-optio-purple/30 rounded-xl p-4 space-y-3 bg-optio-purple/5 mb-6">
      {header}

      {isLink ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm"
              placeholder="Title (e.g. Whole Brain Teaching, part 1)" aria-label="Training title" autoFocus />
            <Input value={url} onChange={(e) => setUrl(e.target.value)} className="text-sm"
              placeholder="https://… (a video, a document, a slide deck)" aria-label="Training link" />
          </div>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="text-sm" aria-label="What this training covers"
            placeholder="What it covers, and what to do with it (optional)" />
        </div>
      ) : tab === 'existing' ? (
        /* Type to find. The native dropdown this replaced held the school's
           quests and the whole Optio library in one scroll -- about two
           hundred rows -- which is unsearchable however it is grouped
           (Tanner, 2026-09-17). SearchSelect is the platform rule for any
           long-list picker (components/ui/SearchSelect); the school's own
           quests are the list, the library joins on request. */
        <div className="space-y-2">
          <SearchSelect
            value={questId}
            onChange={setQuestId}
            options={options.filter((q) => includeLibrary || q.source === 'organization')}
            getId={(q) => q.quest_id}
            getLabel={(q) => (q.source === 'library' ? `${q.title} \u00b7 Optio library` : q.title)}
            placeholder={includeLibrary ? 'Type a quest name (school or Optio library)\u2026' : 'Type a quest name\u2026'}
            limit={60}
          />
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            <input type="checkbox" checked={includeLibrary} onChange={(e) => setIncludeLibrary(e.target.checked)} />
            Also search the Optio library
            {options.some((q) => q.source === 'library') && (
              <span className="text-neutral-400">({options.filter((q) => q.source === 'library').length} quests)</span>
            )}
          </label>
        </div>
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
              <div className="w-24 h-16 rounded-lg bg-gradient-primary flex items-center justify-center">
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
          questId={editItem?.quest_id || null}
          titlePlaceholder={audience === 'family' ? 'Quest title (e.g. Back to school night)'
            : audience === 'student' ? 'Quest title (e.g. Welcome to iCreate)'
              : 'Quest title (e.g. Classroom management)'}
          descriptionPlaceholder={audience === 'family' ? 'What are families doing?'
            : audience === 'student' ? 'What are students doing?' : 'What are teachers learning?'}
          taskHint={'Preset tasks are copied to each person when they start the quest. '
            + 'Leave it empty and they write their own.'}
          creditDefault={false}
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input value={category} onChange={(e) => setCategory(e.target.value)} className="text-sm"
          placeholder="Category (e.g. Onboarding, Classroom management)" aria-label="Category" />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required for everyone it goes to
        </label>
        {!isLink && (<>
        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <span className="shrink-0 pt-2">XP to finish</span>
          <span className="flex-1">
            <span className="flex items-center gap-2">
              <Input type="number" min={0} step={25} value={xpValue}
                onChange={(e) => { setXpEdited(true); setXpThreshold(e.target.value) }}
                placeholder="Any amount" aria-label="XP required to finish"
                className="text-sm" />
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
        </>)}
        {/* Who it goes to. Several groups at once, because a school's
            orientation quest is one quest whether the parents or the teenagers
            are doing it (iCreate, 2026-08-17). A link is for staff only. */}
        <div className="sm:col-span-2 border-t border-gray-200 pt-3">
          {!isLink && <span className="block text-xs text-neutral-500 mb-1.5">Who gets this quest</span>}
          {!isLink && <div className="flex flex-wrap items-center gap-4">
            {[['staff', 'Staff'], ['family', 'Parents'], ['student', 'Students']].map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm text-neutral-700">
                <input type="checkbox" checked={targets.includes(value)}
                  onChange={() => toggleTarget(value)} />
                {label}
              </label>
            ))}
          </div>}
          {!isLink && targets.includes('student') && (
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
          {(isLink || targets.includes('staff')) && (
            <div className={`${isLink ? '' : 'mt-3 '}text-xs text-neutral-500 space-y-3`}>
              <div>
                <span className="block mb-1">Which staff roles <span className="text-neutral-400">(none ticked = all staff)</span></span>
                <div className="flex items-center gap-3">
                  {STAFF_ROLE_OPTIONS.map(([value, label]) => (
                    <label key={value} className="flex items-center gap-1.5 text-sm text-neutral-700">
                      <input type="checkbox" checked={roles.includes(value)} onChange={() => toggleRole(value)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span className="block mb-1">
                  And these people <span className="text-neutral-400">(as well as the roles above)</span>
                </span>
                {people.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {people.map((id) => (
                      <span key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 px-2 py-0.5 text-optio-purple">
                        {nameOf(id)}
                        <button type="button" aria-label={`Remove ${nameOf(id)}`}
                          onClick={() => setPeople(people.filter((x) => x !== id))}
                          className="text-optio-purple/60 hover:text-red-600">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <SearchSelect
                  value=""
                  onChange={(id) => { if (id && !people.includes(id)) setPeople([...people, id]) }}
                  options={staff.filter((p) => !people.includes(p.id))}
                  getId={(p) => p.id} getLabel={(p) => p.name}
                  placeholder="Search staff…"
                />
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
        {isLink ? (
          <button type="button" onClick={addLink} disabled={saveLink.isPending || !title.trim() || !url.trim()}
            className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
            {saveLink.isPending ? 'Saving…' : editingLink ? 'Save changes' : 'Add link'}
          </button>
        ) : tab === 'existing' ? (
          <button onClick={add} disabled={busy || !questId}
            className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Adding…' : 'Add training'}
          </button>
        ) : editItem ? (
          <button onClick={saveEdits} disabled={busy || loadingEdit || !title.trim()}
            className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
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
              className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
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
