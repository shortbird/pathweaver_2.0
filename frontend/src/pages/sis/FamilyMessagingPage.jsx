import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import TemplateControls from '../../components/announcements/TemplateControls'
import RichTextEditor from '../../components/course/outline/RichTextEditor'
import AnnouncementBody from '../../components/announcements/AnnouncementBody'
import { isBlank } from '../../utils/richText'
import { useConfirm } from '../../contexts/ConfirmContext'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import SearchSelect from '../../components/ui/SearchSelect'
import { classLabel } from '../../components/sis/classLabel'

/**
 * Compose an announcement to families/students/advisors. Reuses the existing
 * /api/announcements endpoint (in-app bell + push + the durable announcements
 * row). "Families" maps to the parents audience.
 *
 * Two things iCreate asked for shape this page (d63154c7, 2e930120, 857b5f70):
 *
 * - It can be narrowed to classes, teachers, or an age range, ANDed together.
 *   Parents follow from the students, so "the parents of the Tuesday choir" is
 *   one selection rather than a list somebody assembles by hand. The narrowing
 *   applies to teachers too: audience "Teachers" + two picked teachers reaches
 *   those two, not the whole faculty (16c6e39e — a teachers-only note used to
 *   fan out to every advisor, three of whom are also parents).
 * - Email is a deliberate tick, not automatic. An in-app note to one class used
 *   to also be three hundred emails, which is how a school teaches its families
 *   to ignore its email. The Community board already worked this way; this is
 *   the same rule on the send.
 */
// "Families" reaches guardians, not their children -- tick Students as well to
// reach both. That was not obvious from the labels alone, and picking one
// believing it meant the other is exactly what happened (iCreate, 2026-08-26:
// "Does families mean parents and students? If i send it to students do the
// parents get the email too?"). The live recipient count under the composer is
// the real answer; these hints stop the question being asked at all.
const AUDIENCES = [
  { key: 'parents', label: 'Families', hint: 'Parents and guardians' },
  { key: 'students', label: 'Students', hint: 'The students themselves' },
  { key: 'advisors', label: 'Teachers', hint: 'Staff who teach them' },
]

/** One chip list backed by the platform's type-to-filter combobox.
 * `getChipLabel` (optional) shortens the chosen chips when the dropdown label
 * carries disambiguating detail the chip doesn't need. */
const Picker = ({ label, options, chosen, setChosen, getLabel, getChipLabel, placeholder }) => {
  const byId = new Map(options.map((o) => [o.id, o]))
  const remaining = options.filter((o) => !chosen.includes(o.id))
  const chipLabel = getChipLabel || getLabel
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-neutral-500 w-16 shrink-0">{label}</span>
        <div className="flex-1">
          <SearchSelect
            value=""
            onChange={(id) => id && setChosen([...chosen, id])}
            options={remaining}
            getId={(o) => o.id}
            getLabel={getLabel}
            placeholder={placeholder}
          />
        </div>
      </div>
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5 ml-[4.5rem]">
          {chosen.map((id) => (
            <button key={id} onClick={() => setChosen(chosen.filter((x) => x !== id))}
              className="px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple text-xs hover:bg-optio-purple/20"
              title="Remove">
              {byId.get(id) ? chipLabel(byId.get(id)) : id} ×
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const FamilyMessagingPage = () => {
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const { user } = useAuth()
  // A teacher sends to their own classes, nothing wider — the backend enforces
  // this (POST /api/announcements refuses an advisor send with no class, a
  // class they don't teach, or teacher targeting), so everything here is
  // chrome: require a class up front, hide the whole-school affordances.
  const admin = isSisAdmin(user)
  const confirm = useConfirm()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audiences, setAudiences] = useState(['parents'])
  const [classIds, setClassIds] = useState([])
  const [teacherIds, setTeacherIds] = useState([])
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [alsoEmail, setAlsoEmail] = useState(false)
  const [classes, setClasses] = useState([])
  const [teachers, setTeachers] = useState([])
  const [sending, setSending] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const toggle = (key) => {
    setAudiences((a) => (a.includes(key) ? a.filter((x) => x !== key) : [...a, key]))
  }

  const loadHistory = useCallback(() => {
    if (!orgId) { setLoadingHistory(false); return }
    setLoadingHistory(true)
    api.get('/api/announcements', { params: { organization_id: orgId } })
      .then((r) => { if (r.data?.success) setHistory(r.data.announcements || []) })
      .catch(() => { /* history is supplementary; stay silent */ })
      .finally(() => setLoadingHistory(false))
  }, [orgId])

  useEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => {
    if (!orgId) return
    api.get(withOrg('/api/sis/classes', orgId))
      .then((r) => setClasses(r.data?.classes || []))
      .catch(() => setClasses([]))
    api.get(withOrg('/api/sis/staff', orgId))
      .then((r) => setTeachers(r.data?.staff || []))
      .catch(() => setTeachers([]))
  }, [orgId])

  const [nudging, setNudging] = useState(null)
  const nudge = async (a) => {
    if (!(await confirm(`Nudge everyone who hasn't opened "${a.title}"? They get one reminder notification.`))) return
    setNudging(a.id)
    try {
      const r = await api.post(`/api/announcements/${a.id}/nudge`, {})
      const n = r.data?.notified ?? 0
      toast.success(n === 0 ? 'Everyone has already seen it' : `Nudged ${n} ${n === 1 ? 'person' : 'people'}`)
      loadHistory()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to nudge')
    } finally {
      setNudging(null)
    }
  }

  const removeAnnouncement = async (a) => {
    if (!(await confirm(`Delete "${a.title}"? It disappears from families' announcement pages and notifications too.`))) return
    try {
      await api.delete(`/api/announcements/${a.id}`)
      setHistory((h) => h.filter((x) => x.id !== a.id))
      toast.success('Announcement deleted')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to delete announcement')
    }
  }

  const targeted = classIds.length || teacherIds.length || minAge || maxAge

  // Who this selection actually reaches, resolved by the same code that does
  // the sending. The picker has two overlapping ways to narrow a send and used
  // to say nothing about the result, so it was possible to believe a message
  // had gone to families when it had gone to students (iCreate, 2026-08-26).
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!orgId || !audiences.length) { setPreview(null); return }
    let cancelled = false
    const t = setTimeout(() => {
      api.post('/api/announcements/recipient-preview', {
        organization_id: orgId,
        audiences,
        class_ids: classIds,
        teacher_ids: teacherIds,
        min_age: minAge === '' ? null : Number(minAge),
        max_age: maxAge === '' ? null : Number(maxAge),
      })
        .then((r) => { if (!cancelled) setPreview(r.data) })
        .catch(() => { if (!cancelled) setPreview(null) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [orgId, audiences, classIds, teacherIds, minAge, maxAge])

  const ROLE_WORDS = { parents: 'guardians', students: 'students', advisors: 'teachers' }
  const previewText = () => {
    if (!preview) return null
    if (!preview.total) return 'Nobody matches this selection yet'
    const parts = Object.entries(preview.by_role || {})
      .filter(([, n]) => n > 0)
      .map(([role, n]) => `${n} ${ROLE_WORDS[role] || role}`)
    return `Goes to ${preview.total} ${preview.total === 1 ? 'person' : 'people'}`
      + (parts.length > 1 ? ` (${parts.join(', ')})` : '')
  }
  const clearTargeting = () => {
    setClassIds([]); setTeacherIds([]); setMinAge(''); setMaxAge('')
  }

  const send = async () => {
    if (!title.trim() || isBlank(message)) { toast.error('Title and message are required'); return }
    if (!audiences.length) { toast.error('Pick at least one audience'); return }
    if (!orgId) { toast.error('No organization selected'); return }
    if (!admin && !classIds.length) { toast.error('Pick one of your classes to message'); return }
    setSending(true)
    try {
      const r = await api.post('/api/announcements', {
        title: title.trim(),
        message,
        audiences,
        organization_id: orgId,
        class_ids: classIds,
        teacher_ids: teacherIds,
        min_age: minAge === '' ? null : Number(minAge),
        max_age: maxAge === '' ? null : Number(maxAge),
        send_email: alsoEmail,
      })
      const n = r.data?.recipients
      toast.success(n == null
        ? 'Announcement sent'
        : `Sent to ${n} ${n === 1 ? 'person' : 'people'}${r.data?.emailed ? ', email included' : ''}`)
      setTitle('')
      setMessage('')
      loadHistory()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Messaging</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <p className="text-sm text-neutral-500 mb-5">
          {admin
            ? <>Send an announcement to {orgs.find((o) => o.id === orgId)?.name || 'your school'}. It arrives in-app
              (notification bell) and as a push; tick the box below to send it by email too.</>
            : <>Send an announcement to the families and students of a class you teach. It arrives in-app
              (notification bell) and as a push; tick the box below to send it by email too.</>}
        </p>

        <label className="block text-xs font-medium text-neutral-500 mb-1">Audience</label>
        <div className="flex gap-2 mb-4">
          {AUDIENCES.map((a) => (
            <button
              key={a.key}
              onClick={() => toggle(a.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                audiences.includes(a.key)
                  ? 'bg-optio-purple text-white border-optio-purple'
                  : 'bg-white text-neutral-600 border-gray-300 hover:border-optio-purple'
              }`}
              title={a.hint}
            >
              {a.label}
            </button>
          ))}
          <span className="w-full text-xs text-neutral-500">
            {AUDIENCES.filter((a) => audiences.includes(a.key))
              .map((a) => `${a.label}: ${a.hint.toLowerCase()}`).join(' · ')
              || 'Pick who this goes to'}
          </span>
        </div>

        {/* Narrowing. Long lists, so the platform's type-to-filter combobox
            rather than a native multi-select: it adds one at a time to a chip
            list, which is also how you take one back off. */}
        <div className="border border-gray-200 rounded-lg p-3 mb-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-neutral-500">
              {admin ? 'Narrow it down (optional)' : 'Your classes — pick at least one'}
            </span>
            {admin && targeted ? (
              <button onClick={clearTargeting} className="text-xs text-optio-purple hover:underline">
                Remove these filters
              </button>
            ) : null}
          </div>

          {/* Options carry the meeting day/time — same class names repeat
              across sections; chips stay short (name only). */}
          <Picker label="Classes" options={classes} chosen={classIds} setChosen={setClassIds}
            getLabel={classLabel} getChipLabel={(c) => c.name} placeholder="Add a class…" />
          {admin && (
            <Picker label="Teachers" options={teachers} chosen={teacherIds} setChosen={setTeacherIds}
              getLabel={(t) => t.name || t.display_name || t.email} placeholder="Add a teacher…" />
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-500 w-16 shrink-0">Ages</span>
            <input type="number" min="0" max="99" value={minAge} onChange={(e) => setMinAge(e.target.value)}
              placeholder="from" aria-label="Minimum age" className={`${field} w-24`} />
            <span className="text-xs text-neutral-400">to</span>
            <input type="number" min="0" max="99" value={maxAge} onChange={(e) => setMaxAge(e.target.value)}
              placeholder="to" aria-label="Maximum age" className={`${field} w-24`} />
          </div>

          {targeted ? (
            <p className="text-xs text-neutral-500">
              Everything you pick has to be true at once — an age range on top of a class means
              only the children in that class who are that age. Families are included through
              their children.
            </p>
          ) : null}
        </div>

        <label className="flex items-start gap-2 mb-4 cursor-pointer">
          <input type="checkbox" checked={alsoEmail} onChange={(e) => setAlsoEmail(e.target.checked)}
            className="mt-0.5 accent-optio-purple" />
          <span className="text-sm text-neutral-700">
            Email this as well
            <span className="block text-xs text-neutral-500">
              Off by default. Everyone gets it in the app and as a push either way.
            </span>
          </span>
        </label>

        <label className="block text-xs font-medium text-neutral-500 mb-1">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} mb-4`} placeholder="Subject line" />

        <label className="block text-xs font-medium text-neutral-500 mb-1">Message</label>
        <div className="mb-5">
          <RichTextEditor
            value={message}
            onChange={setMessage}
            placeholder="Write your announcement…"
            minHeight="140px"
            alignment={false}
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={send} loading={sending}>Send announcement</Button>
            {previewText() && (
              <span className={`text-sm ${preview?.total ? 'text-neutral-600' : 'text-amber-700'}`}>
                {previewText()}
              </span>
            )}
          </div>
          {/* Templates live in org settings, which the templates endpoints
              gate to the admin tier — a teacher would only get a 403. */}
          {admin && (
            <TemplateControls
              key={orgId || 'no-org'}
              orgId={orgId}
              title={title}
              body={message}
              onApply={({ title: t, body: b }) => {
                setTitle(t)
                setMessage(b)
              }}
            />
          )}
        </div>
      </div>

      <div className="max-w-2xl mt-8">
        <h2 className="text-sm font-semibold text-neutral-700 mb-3">Recent announcements</h2>
        {loadingHistory ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-neutral-400">No announcements yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((a) => (
              <div key={a.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium text-neutral-900">{a.title}</h3>
                  <span className="text-xs text-neutral-400 whitespace-nowrap flex items-center gap-2">
                    {new Date(a.created_at).toLocaleString()}
                    {/* A word, not a glyph: the small x read as decoration and
                        the office asked for a delete feature that was already
                        here (iCreate, 2026-08-29). */}
                    <button
                      type="button"
                      onClick={() => removeAnnouncement(a)}
                      className="px-2 py-0.5 rounded border border-gray-200 text-xs font-medium text-neutral-500 hover:text-red-600 hover:border-red-300"
                      aria-label={`Delete announcement ${a.title}`}
                    >
                      Delete
                    </button>
                  </span>
                </div>
                <AnnouncementBody text={a.content} className="text-sm text-neutral-600 mt-1" />
                <div className="flex items-center gap-3 flex-wrap mt-2">
                  <span className="inline-block px-2 py-0.5 text-xs font-medium bg-optio-purple/10 text-optio-purple rounded capitalize">
                    {(a.target_audience || '').replace(/,/g, ', ')}
                  </span>
                  {/* Read receipts (announcement_reads via the archive's
                      mark-read). recipient_count null = sent before receipts
                      existed — say nothing rather than "0 of 0". */}
                  {typeof a.recipient_count === 'number' && (
                    <>
                      <span className="text-xs text-neutral-500">
                        Seen by {a.read_count ?? 0} of {a.recipient_count}
                      </span>
                      {(a.read_count ?? 0) < a.recipient_count && (
                        <button
                          type="button"
                          onClick={() => nudge(a)}
                          disabled={nudging === a.id}
                          className="text-xs font-medium text-optio-purple hover:underline disabled:opacity-40"
                          title="One reminder notification to everyone who hasn't opened it (once per 24 hours)"
                        >
                          {nudging === a.id ? 'Nudging…' : 'Nudge the rest'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default FamilyMessagingPage
