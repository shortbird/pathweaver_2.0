import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import SearchSelect from '../ui/SearchSelect'
import { Input, Textarea } from '../ui/Input'
import GlassTabBar from '../ui/GlassTabBar'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'
import QuestEditor from './QuestEditor'
import TrainingSettingsFields, {
  blankTrainingSettings, trainingSettingsBody, trainingSettingsFrom,
} from './TrainingSettingsFields'
import { useSaveTrainingLink } from '../../hooks/api/useTraining'
import { assignedMessage } from '../../pages/sis/trainingCopy'

/**
 * The one form for adding or editing a training, whatever shape it takes.
 *
 * Three doors on every tab: attach an existing quest, build a new one, or link
 * to a video or document (families and students got the link door on
 * 2026-09-22, ae16c5da; staff had it first). Until
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
 *
 * Building or editing a quest here is QuestEditor, the one quest form every
 * SIS screen shares since P6 (2026-09-23), with the catalog settings as its
 * training section. "Build a new one" starts a draft in the catalog at once,
 * so its header image and files work from the first minute, and it is listed
 * here as a draft until it is published. This form keeps the two doors that
 * are not a quest being written: attaching one that exists, and a link.
 */

export default function TrainingForm({ orgId, audience, onAdded, onCancel, orgLogo = null, editItem = null }) {
  const editingLink = editItem?.kind === 'link'
  const editingQuest = !!editItem && !editingLink
  const [options, setOptions] = useState([])
  const [questId, setQuestId] = useState('')
  // The Optio library is 168 quests to the school's few dozen. Off by default
  // the picker is the school's own list; on, the library joins it, each entry
  // saying where it came from.
  const [includeLibrary, setIncludeLibrary] = useState(false)
  const [settings, setSettings] = useState(() => (editingLink
    ? { ...blankTrainingSettings(audience), ...trainingSettingsFrom(editItem, audience) }
    : blankTrainingSettings(audience)))
  const patchSettings = (patch) => setSettings((s) => ({ ...s, ...patch }))
  // The finish line for an attached quest (quests.xp_threshold, enforced by the
  // ordinary end-quest route). Blank means any amount finishes it.
  const [xpThreshold, setXpThreshold] = useState('')
  const [busy, setBusy] = useState(false)

  // Three doors: attach a quest, build one, or link to a video or document.
  //
  // The link door was staff-only until 2026-09-22, on the stated grounds that
  // a link for families or students had no portal surface to be done on. Both
  // have one now -- families on /family/forms (/api/sis/parent/training), and
  // students on /school (/api/sis/student/training) -- so every tab gets the
  // third door: "I would like to link to a video or document option in the
  // 'for families' (and students if it's not there too) ... without creating
  // an entire quest" (iCreate, ae16c5da).
  const [tab, setTab] = useState(editingLink ? 'link' : 'existing') // existing | new | link
  const [title, setTitle] = useState(editingLink ? (editItem.title || '') : '')
  const [description, setDescription] = useState(editingLink ? (editItem.description || '') : '')
  // The link kind: a video, a document, a slide deck. Open it, press done.
  const [url, setUrl] = useState(editingLink ? (editItem.url || '') : '')
  const saveLink = useSaveTrainingLink(orgId)

  useEffect(() => {
    if (!orgId || editItem) return
    // Training content is an ordinary quest — the school's own, or the library.
    api.get(`${withOrg('/api/sis/training/assignable-quests', orgId)}&audience=${audience}`)
      .then((r) => setOptions(r.data?.quests || []))
      .catch(() => setOptions([]))
  }, [orgId, audience, editItem])

  const add = async () => {
    if (!questId) { toast.error('Pick a quest'); return }
    setBusy(true)
    try {
      const res = await api.post('/api/sis/training', {
        organization_id: orgId, quest_id: questId, audience,
        xp_threshold: xpThreshold === '' ? null : Number(xpThreshold),
        ...trainingSettingsBody(settings),
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

  const addLink = async () => {
    if (!title.trim()) { toast.error('Give the training a title'); return }
    if (!url.trim()) { toast.error('Paste the link to the training'); return }
    try {
      await saveLink.mutateAsync({ id: editingLink ? editItem.id : undefined, body: {
        title: title.trim(), url: url.trim(), description: description.trim(),
        category: settings.category.trim(), is_required: settings.required,
        // Which tab built it. The server translates staff/family/student into the
        // org_resources vocabulary; without it every link is filed as staff,
        // which is what it did until 2026-09-22.
        audience,
        // Role narrowing is a staff idea (the column allows only staff roles),
        // and a family or student link reaches every family or student.
        // Sending them on one would store a rule nothing reads.
        ...(audience === 'staff'
          ? { visible_to_roles: settings.roles, visible_to_user_ids: settings.people }
          : {}),
      } })
      toast.success(editingLink ? 'Changes saved' : 'Added to training')
      onAdded()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the link')
    }
  }

  // Building a new quest, or reopening one: the quest editor, with this
  // catalog's settings as its training section. It saves as it goes, so
  // closing it always leaves the catalog worth re-reading.
  if (editingQuest || tab === 'new') {
    return (
      <QuestEditor context="training" orgId={orgId} audience={audience} orgLogo={orgLogo}
        questId={editingQuest ? editItem.quest_id : null}
        trainingId={editingQuest ? editItem.id : null}
        onDone={() => onAdded()}
        onClose={() => (editingQuest ? onCancel() : setTab('existing'))} />
    )
  }

  const doors = [['existing', 'Use an existing quest'], ['new', 'Build a new one'],
    ['link', 'Link to a video or document']]
  const isLink = tab === 'link'

  return (
    <div className="border border-optio-purple/30 rounded-xl p-4 space-y-3 bg-optio-purple/5 mb-6">
      <p className="text-sm text-neutral-600">
        {editingLink
          ? 'Editing this link.'
          : audience === 'family'
            ? 'A family quest is an ordinary quest \u2014 parents complete it on their own account. Attach one you already have, build it here, or link to a video or document they only have to watch.'
            : audience === 'student'
              ? 'A student quest is an ordinary quest, set by the school rather than chosen. Attach one you already have, build it here, or link to a video or document they only have to watch.'
              : 'Training is a quest or a link. Attach a quest you already have, build one here, or link to a video or document.'}
      </p>
      {!editItem && (
        <GlassTabBar
          align="start" aria-label="How to add training"
          tabs={doors.map(([id, label]) => ({ id, label }))}
          active={tab} onSelect={setTab}
        />
      )}

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
      ) : (
        /* Type to find. The native dropdown this replaced held the school's
           quests and the whole Optio library in one scroll -- about two
           hundred rows -- which is unsearchable however it is grouped
           (Tanner, 2026-09-17). */
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
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <span className="shrink-0">XP to finish</span>
            <Input type="number" min={0} step={25} value={xpThreshold}
              onChange={(e) => setXpThreshold(e.target.value)}
              placeholder="Any amount" aria-label="XP required to finish" className="text-sm w-40" />
          </label>
        </div>
      )}

      <TrainingSettingsFields value={settings} onChange={patchSettings} audience={audience}
        orgId={orgId} isLink={isLink} />

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
        {isLink ? (
          <button type="button" onClick={addLink} disabled={saveLink.isPending || !title.trim() || !url.trim()}
            className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
            {saveLink.isPending ? 'Saving…' : editingLink ? 'Save changes' : 'Add link'}
          </button>
        ) : (
          <button onClick={add} disabled={busy || !questId}
            className="px-4 py-1.5 rounded-lg bg-gradient-primary text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Adding…' : 'Add training'}
          </button>
        )}
      </div>
    </div>
  )
}
