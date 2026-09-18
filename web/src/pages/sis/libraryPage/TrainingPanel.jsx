import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { AcademicCapIcon, PlusIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import useTrainingOrder from '../../../hooks/useTrainingOrder'
import api from '../../../services/api'
import { useSisOrg, withOrg } from '../useSisOrg'
import { useAuth } from '../../../contexts/AuthContext'
import { isSisAdmin } from '../sisRole'
import TrainingForm from '../../../components/sis/TrainingForm'
import TrainingRow from '../../../components/sis/TrainingRow'
import TrainingPeoplePicker from '../../../components/sis/TrainingPeoplePicker'
import TrainingProgressTable from '../../../components/sis/TrainingProgressTable'
import { useDeleteTrainingLink } from '../../../hooks/api/useTraining'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { words, assignedMessage } from '../trainingCopy'
import { Input } from '../../../components/ui/Input'

/**
 * TrainingPanel — the training a school sets: quests, and links to videos or
 * documents. The Training tab of Library (LibraryPage) since M22; it was the
 * Training page. The shell owns the heading and the tab bar.
 *
 * Three audiences (iCreate, 2026-08-06: "admin need to be able to create quests
 * for all their teachers and families"):
 *   Teachers  training — the original page. Quests and links.
 *   Families  quests guardians do themselves, e.g. back to school night.
 *   Students  quests the school sets, optionally narrowed by age.
 *
 * The tabs are a filter, not a filing system: one quest can be set for several
 * groups at once — iCreate's orientation quest goes to "12+ students and all
 * parents" (2026-08-17) — and shows on every tab it targets.
 *
 * One list and one report, whatever kind each row is (M18, 2026-09-17): GET
 * /api/sis/training hands back quests and links together in the creator's
 * order, each with `kind`, and /training/progress has one column per row.
 * Until M18 links were a second API, read and joined here in the browser.
 * TrainingForm adds or edits either kind; TrainingRow draws either.
 *
 * Teachers see what they need to do and how far they've got; admins also see
 * who has finished what, one group at a time. A quest is an ordinary quest,
 * written in the normal curriculum editor (videos included) and completed in
 * the web platform; a link is opened and marked done here.
 *
 * Families read their own side in the family portal; students just find the
 * quest on their account, which is why the student audience has no page here.
 */

const TrainingPanel = () => {
  const confirm = useConfirm()
  const { user } = useAuth()
  const { orgId, activeOrg } = useSisOrg()
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
      .catch(() => toast.error('Failed to load the training'))
      .finally(() => setLoading(false))
    if (admin) {
      api.get(`${withOrg('/api/sis/training/progress', orgId)}&audience=${audience}`)
        .then((r) => setReport(r.data))
        .catch(() => setReport(null))
    }
  }, [orgId, admin, audience])

  const deleteLink = useDeleteTrainingLink(orgId, { onSuccess: load })

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
    const question = t.kind === 'link'
      ? `Remove "${t.title}" from training?`
      : `Remove "${t.title}" from training? The quest itself is kept.`
    if (!(await confirm(question))) return
    try {
      if (t.kind === 'link') await deleteLink.mutateAsync(t.id)
      else {
        await api.delete(withOrg(`/api/sis/training/${t.id}`, orgId))
        load()
      }
      toast.success('Removed from training')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove it')
    }
  }

  // Quests and links share the category headings: a category is how the
  // office files training, whatever shape each item takes.
  // Type to narrow by name. The box means the thing each view is a list OF:
  // in "The quests" it finds a training; in "Who has done what" it finds a
  // person and shows their whole row, every column, so an admin can look
  // one teacher up and see all of their progress at once (Tanner,
  // 2026-09-17). The columns there stay complete for that reason.
  const [search, setSearch] = useState('')
  const matches = useCallback((title) => !search.trim()
    || (title || '').toLowerCase().includes(search.trim().toLowerCase()), [search])

  // In the order the creator arranged it (hooks/useTrainingOrder): quests and
  // links on one shared scale, moved with the arrows below.
  const { ordered, move } = useTrainingOrder({ training, orgId, reload: load })

  const grouped = useMemo(() => ordered
    .filter((t) => matches(t.title))
    .reduce((acc, t) => {
      const key = t.category || 'General'
      ;(acc[key] = acc[key] || []).push(t)
      return acc
    }, {}), [ordered, matches])
  const anyMatch = Object.keys(grouped).length > 0


  const done = (t) => (t.kind === 'link' ? !!t.my_done : !!t.my_progress?.completed)
  const mine = useMemo(() => {
    const req = training.filter((t) => t.is_required)
    return { requiredTotal: req.length, requiredDone: req.filter(done).length }
  }, [training])

  return (
    <div>
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
              : `${mine.requiredDone} of ${mine.requiredTotal} required items complete.`}
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

      {adding && <TrainingForm orgId={orgId} audience={audience} orgLogo={orgLogo}
        onAdded={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />}

      {editing && <TrainingForm key={`${editing.kind}-${editing.id}`} orgId={orgId} audience={audience}
        orgLogo={orgLogo} editItem={editing}
        onAdded={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />}

      {!loading && training.length > 0 && (
        <div className="mb-4 max-w-md">
          <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={view === 'everyone'
              ? `Search ${words(audience).many} by name\u2026`
              : `Search ${words(audience).quests} by name\u2026`}
            aria-label={view === 'everyone' ? `Search ${words(audience).many}` : `Search ${words(audience).quests}`}
            className="text-sm" />
        </div>
      )}

      {loading && <p className="text-neutral-500">Loading…</p>}

      {!loading && view === 'mine' && training.length > 0 && !anyMatch && (
        <p className="text-sm text-neutral-500">Nothing matches that search.</p>
      )}

      {!loading && !training.length && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <AcademicCapIcon className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <p className="text-sm text-neutral-600 font-medium">
            No {words(audience).quests} yet.
          </p>
          {admin && <p className="text-sm text-neutral-500 mt-1">
            {audience === 'staff' ? 'Add a quest, or link to a video or document.' : 'Build a quest, then add it here.'}
          </p>}
        </div>
      )}

      {!loading && view === 'mine' && Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="mb-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">{category}</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {items.map((t, index) => (
              <div key={`${t.kind}-${t.id}`} className="flex items-stretch">
                {/* The creator's order. Arrows rather than drag: the rows are
                    tall and the list is short, and a keyboard can do it. */}
                {admin && !search.trim() && (
                  <div className="flex flex-col justify-center pl-2 shrink-0">
                    <button type="button" onClick={() => move(t, -1)} disabled={index === 0}
                      aria-label={`Move ${t.title} up`}
                      className="p-0.5 text-gray-400 hover:text-optio-purple disabled:opacity-30 disabled:hover:text-gray-400">
                      <ChevronUpIcon className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => move(t, 1)} disabled={index === items.length - 1}
                      aria-label={`Move ${t.title} down`}
                      className="p-0.5 text-gray-400 hover:text-optio-purple disabled:opacity-30 disabled:hover:text-gray-400">
                      <ChevronDownIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <TrainingRow item={t} orgId={orgId} audience={audience} admin={admin}
                    assigning={assigning === t.id} onChanged={load}
                    onAssign={() => assign(t)} onPick={() => setPicking(t)}
                    onPublish={() => publish(t)} onSaveXp={saveXp}
                    onEdit={() => { setAdding(false); setEditing(t) }}
                    onRemove={() => remove(t)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!loading && view === 'everyone' && admin && (
        <TrainingProgressTable report={report} ordered={ordered} audience={audience}
          personMatches={matches} />
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

export default TrainingPanel
