import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import {
  AcademicCapIcon, CheckCircleIcon, PlusIcon, TrashIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { switchSurfaceInApp } from '../../utils/appSurface'
import QuestDraftForm, { blankTask } from '../../components/sis/QuestDraftForm'

/**
 * StaffTrainingPage — the quests a school sets, built out of ordinary quests.
 *
 * Two audiences (iCreate, 2026-08-06: "admin need to be able to create quests
 * for all their teachers and families"):
 *   Teachers  training — the original page.
 *   Families  quests guardians do themselves, e.g. back to school night.
 *
 * Teachers see what they need to do and how far they've got; admins also see
 * who has finished what, for either audience. The content itself is an ordinary
 * quest, so it is written in the normal curriculum editor (videos included) and
 * completed in the web platform — this page is the staff-facing door to it.
 *
 * Families read their own side in the family portal, not here.
 */

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent'

const progressLabel = (p) => {
  if (!p?.started) return 'Not started'
  if (p.completed) return 'Complete'
  if (!p.total) return 'In progress'
  return `${p.done} of ${p.total} tasks`
}

const progressStyle = (p) => {
  if (!p?.started) return 'bg-gray-100 text-neutral-500'
  if (p.completed) return 'bg-green-100 text-green-700'
  return 'bg-amber-100 text-amber-800'
}

const AddTraining = ({ orgId, audience, onAdded, onCancel }) => {
  const [options, setOptions] = useState([])
  const [questId, setQuestId] = useState('')
  const [category, setCategory] = useState('')
  const [required, setRequired] = useState(false)
  const [busy, setBusy] = useState(false)
  // "Where does the quest get built?" (iCreate, 2026-08-06). Attaching an
  // existing quest is a dead end if you have not made one, and sending somebody
  // to the learning app to author one and come back is not a flow people
  // finish. Both doors, same panel.
  const [tab, setTab] = useState('existing') // existing | new
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tasks, setTasks] = useState([blankTask()])

  useEffect(() => {
    if (!orgId) return
    // Training content is an ordinary quest — the school's own, or the library.
    api.get(`${withOrg('/api/sis/training/assignable-quests', orgId)}&audience=${audience}`)
      .then((r) => setOptions(r.data?.quests || []))
      .catch(() => setOptions([]))
  }, [orgId, audience])

  const add = async () => {
    if (!questId) { toast.error('Pick a quest'); return }
    setBusy(true)
    try {
      await api.post('/api/sis/training', {
        organization_id: orgId, quest_id: questId, audience,
        category: category.trim(), is_required: required,
      })
      toast.success(audience === 'family' ? 'Set for families' : 'Added to training')
      onAdded()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add it')
    } finally {
      setBusy(false)
    }
  }

  const createAndAdd = async () => {
    if (!title.trim()) { toast.error('Give the quest a title'); return }
    setBusy(true)
    try {
      await api.post('/api/sis/training/create', {
        organization_id: orgId, audience,
        title: title.trim(), description: description.trim(),
        tasks: tasks.filter((t) => t.title.trim()),
        category: category.trim(), is_required: required,
      })
      toast.success(audience === 'family' ? 'Quest built and set for families' : 'Quest built and added')
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
        {audience === 'family'
          ? 'A family quest is an ordinary quest \u2014 parents complete it on their own account. Attach one you already have, or build it here.'
          : 'Training is a quest. Attach one you already have, or build it here.'}
      </p>
      {/* Two doors: attach one that exists, or build one here. */}
      <div className="flex gap-1 border-b border-gray-200">
        {[['existing', 'Use an existing quest'], ['new', 'Build a new one']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === k ? 'border-optio-purple text-optio-purple' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'existing' ? (
        <select value={questId} onChange={(e) => setQuestId(e.target.value)} className={inputClass}
          aria-label="Choose a quest">
          <option value="">Choose a quest…</option>
          {options.map((q) => (
            <option key={q.quest_id} value={q.quest_id}>
              {q.title}{q.source === 'library' ? ' (Optio library)' : ''}
            </option>
          ))}
        </select>
      ) : (
        <QuestDraftForm
          title={title} setTitle={setTitle}
          description={description} setDescription={setDescription}
          tasks={tasks} setTasks={setTasks}
          titlePlaceholder={audience === 'family' ? 'Quest title (e.g. Back to school night)' : 'Quest title (e.g. Classroom management)'}
          descriptionPlaceholder={audience === 'family' ? 'What are families doing?' : 'What are teachers learning?'}
          taskHint={audience === 'family'
            ? 'Preset tasks are copied to each parent when they start the quest. Leave it empty and they write their own.'
            : 'Preset tasks are copied to each teacher when they start the quest. Leave it empty and they write their own.'}
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={category} onChange={(e) => setCategory(e.target.value)}
          placeholder="Category (e.g. Onboarding, Classroom management)" className={inputClass} />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          {audience === 'family' ? 'Required for all families' : 'Required for all staff'}
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">Cancel</button>
        {tab === 'existing' ? (
          <button onClick={add} disabled={busy || !questId}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Adding…' : 'Add training'}
          </button>
        ) : (
          <button onClick={createAndAdd} disabled={busy || !title.trim()}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
            {busy ? 'Building…' : 'Build and add'}
          </button>
        )}
      </div>
    </div>
  )
}

const StaffTrainingPage = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
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

  const remove = async (t) => {
    if (!window.confirm(`Remove "${t.title}" from training? The quest itself is kept.`)) return
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
        <h1 className="text-2xl font-bold text-neutral-900">
          {admin ? 'Quests' : 'Training'}
        </h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        {admin
          ? 'Quests your school sets for its teachers and its families. Open one to start it on the web platform \u2014 progress shows up here automatically.'
          : 'Courses to work through at your own pace. Open one to start it on the web platform \u2014 your progress shows up here automatically.'}
      </p>

      {/* Audience switch. Families read their own side in the family portal;
          this is where an admin decides what is on it. */}
      {admin && (
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white mb-4">
          {[['staff', 'For teachers'], ['family', 'For families']].map(([key, label]) => (
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
              : `${mine.requiredDone} of ${mine.requiredTotal} required courses complete.`}
          </p>
        </div>
      )}

      {admin && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
            {[['mine', audience === 'family' ? 'The quests' : 'The courses'],
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
              <PlusIcon className="w-4 h-4" /> {audience === 'family' ? 'Add a family quest' : 'Add training'}
            </button>
          )}
        </div>
      )}

      {adding && <AddTraining orgId={orgId} audience={audience}
        onAdded={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />}

      {loading && <p className="text-neutral-500">Loading…</p>}

      {!loading && !training.length && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <AcademicCapIcon className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm text-neutral-600 font-medium">
            {audience === 'family' ? 'No family quests yet.' : 'No training courses yet.'}
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
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${progressStyle(t.my_progress)}`}>
                      {progressLabel(t.my_progress)}
                    </span>
                  </div>
                  {t.description && <p className="text-sm text-neutral-500 mt-0.5 line-clamp-2">{t.description}</p>}
                  <button
                    onClick={() => switchSurfaceInApp('learning', `/quests/${t.quest_id}`)}
                    className="inline-flex items-center gap-1.5 text-sm text-optio-purple hover:underline mt-1"
                  >
                    {t.my_progress?.started ? 'Continue' : 'Start this course'}
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                {admin && (
                  <button onClick={() => remove(t)} className="p-1.5 text-gray-400 hover:text-red-500 shrink-0"
                    aria-label={`Remove ${t.title}`}>
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {!loading && view === 'everyone' && admin && (
        !report?.staff?.length ? <p className="text-neutral-500">No staff to report on yet.</p> : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
        <th className="text-left px-4 py-2.5 font-semibold text-neutral-700">
                    {audience === 'family' ? 'Family' : 'Staff'}
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
    </div>
  )
}

export default StaffTrainingPage
