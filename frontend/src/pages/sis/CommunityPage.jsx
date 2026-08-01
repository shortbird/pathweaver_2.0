import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import Button from '../../components/ui/Button'
import ModalOverlay from '../../components/ui/ModalOverlay'
import SearchSelect from '../../components/ui/SearchSelect'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import RichTextEditor from '../../components/course/outline/RichTextEditor'
import AnnouncementBody from '../../components/announcements/AnnouncementBody'

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const TABS = [
  { key: 'highlights', label: 'Highlights' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'lost-found', label: 'Lost & Found' },
  { key: 'recognition', label: 'Recognition' },
  { key: 'events', label: 'Events' },
  { key: 'resources', label: 'Resources' },
]

const REC_TYPES = [
  { value: 'shout_out', label: 'Shout-out' },
  { value: 'student_spotlight', label: 'Student spotlight' },
  { value: 'volunteer', label: 'Volunteer thanks' },
  { value: 'weekly_win', label: 'Weekly win' },
  { value: 'thank_you', label: 'Thank you' },
]
const recTypeLabel = (v) => REC_TYPES.find((t) => t.value === v)?.label || 'Shout-out'

const fmtDate = (v) => {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
const fmtDateTime = (v) => {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * SIS Community Hub — a curated community section for the org: a Highlights landing
 * feed plus Announcements, Lost & Found, and Recognition modules, with thin tabs
 * that link out to the existing Calendar (Events) and Resources pages. Opt-in per
 * org (feature_flags.sis_settings.community_enabled); the route + nav are gated so
 * only enabled orgs reach it. Staff read everything; admins manage announcements and
 * lost & found; any staff member can post a recognition.
 */
const CommunityPage = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const admin = isSisAdmin(user)
  const [tab, setTab] = useState('highlights')

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">Community</h1>
        <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
      </div>
      <p className="text-sm text-neutral-500 mb-5 max-w-2xl">
        The heartbeat of your school — announcements, lost &amp; found, and shout-outs, all in one place.
      </p>

      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-optio-purple text-optio-purple'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!orgId ? (
        <p className="text-neutral-500">Select an organization to view its community.</p>
      ) : (
        <>
          {tab === 'highlights' && <HighlightsTab orgId={orgId} onNavigate={setTab} />}
          {tab === 'announcements' && <AnnouncementsTab orgId={orgId} admin={admin} />}
          {tab === 'lost-found' && <LostFoundTab orgId={orgId} admin={admin} />}
          {tab === 'recognition' && <RecognitionTab orgId={orgId} />}
          {tab === 'events' && <EventsTab orgId={orgId} />}
          {tab === 'resources' && <ResourcesTab />}
        </>
      )}
    </div>
  )
}

// ── Highlights ────────────────────────────────────────────────────────────────
const SectionCard = ({ title, children, action }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-4">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      {action}
    </div>
    {children}
  </div>
)

const HighlightsTab = ({ orgId, onNavigate }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(withOrg('/api/sis/community/highlights', orgId))
      .then((r) => setData(r.data?.highlights || {}))
      .catch(() => toast.error('Failed to load highlights'))
      .finally(() => setLoading(false))
  }, [orgId])

  if (loading) return <p className="text-neutral-500">Loading…</p>
  if (!data) return null

  const { announcements = [], events = [], lost_found = [], recognition = [], birthdays = [] } = data
  const empty = !announcements.length && !events.length && !lost_found.length && !recognition.length && !birthdays.length

  if (empty) {
    return (
      <p className="text-neutral-500">
        Nothing to highlight yet. Post an announcement, add a lost &amp; found item, or share a shout-out to fill this feed.
      </p>
    )
  }

  const link = (t) => (
    <button onClick={() => onNavigate(t)} className="text-xs font-medium text-optio-purple hover:underline">
      View all
    </button>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <SectionCard title="Announcements" action={announcements.length ? link('announcements') : null}>
        {announcements.length ? (
          <ul className="space-y-3">
            {announcements.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                {a.pinned && <span className="mt-0.5 text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple">Pinned</span>}
                {a.priority === 'urgent' && <span className="mt-0.5 text-[11px] font-medium rounded-full px-2 py-0.5 bg-red-100 text-red-700">Urgent</span>}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-900">{a.title}</div>
                  {a.body && <div className="text-xs text-neutral-500 line-clamp-2">{a.body}</div>}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-neutral-400">No announcements.</p>}
      </SectionCard>

      <SectionCard title="This week's events" action={<Link to="/calendar" className="text-xs font-medium text-optio-purple hover:underline">Calendar</Link>}>
        {events.length ? (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="font-medium text-neutral-900">{e.title}</div>
                <div className="text-xs text-neutral-500">
                  {e.all_day ? fmtDate(e.start_at) : fmtDateTime(e.start_at)}{e.location ? ` · ${e.location}` : ''}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-neutral-400">No upcoming events.</p>}
      </SectionCard>

      <SectionCard title="Lost & Found" action={lost_found.length ? link('lost-found') : null}>
        {lost_found.length ? (
          <ul className="space-y-3">
            {lost_found.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                {i.image_url
                  ? <img src={i.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  : <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0" />}
                <div className="min-w-0">
                  <div className="text-sm text-neutral-900 truncate">{i.description}</div>
                  <div className="text-xs text-neutral-500">{i.location_found || 'Location unknown'}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-neutral-400">Nothing in lost &amp; found.</p>}
      </SectionCard>

      <SectionCard title="Recognition" action={recognition.length ? link('recognition') : null}>
        {recognition.length ? (
          <ul className="space-y-3">
            {recognition.map((r) => (
              <li key={r.id} className="text-sm">
                <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-pink/10 text-optio-pink mr-2">{recTypeLabel(r.type)}</span>
                {r.recipient_name && <span className="font-medium text-neutral-900">{r.recipient_name}: </span>}
                <span className="text-neutral-600">{r.message}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-neutral-400">No recognition yet.</p>}
      </SectionCard>

      {birthdays.length > 0 && (
        <SectionCard title="Upcoming birthdays">
          <ul className="flex flex-wrap gap-2">
            {birthdays.map((b) => (
              <li key={b.user_id + b.date} className="text-sm rounded-full bg-gradient-to-r from-[#F3EFF4] to-[#E7D5F2] px-3 py-1 text-optio-purple">
                {b.name} · {fmtDate(b.date)}{b.days_away === 0 ? ' (today)' : ''}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}

// ── Announcements ─────────────────────────────────────────────────────────────
const AnnouncementsTab = ({ orgId, admin }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // row | 'new' | null

  const load = useCallback(() => {
    setLoading(true)
    api.get(withOrg('/api/sis/community/announcements', orgId))
      .then((r) => setItems(r.data?.announcements || []))
      .catch(() => toast.error('Failed to load announcements'))
      .finally(() => setLoading(false))
  }, [orgId])
  useEffect(() => { load() }, [load])

  const remove = async (a) => {
    if (!window.confirm(`Delete "${a.title}"?`)) return
    try {
      await api.delete(`/api/sis/community/announcements/${a.id}?organization_id=${orgId}`)
      toast.success('Announcement deleted')
      load()
    } catch { toast.error('Could not delete') }
  }

  return (
    <div>
      {admin && (
        <div className="mb-4">
          <Button size="sm" onClick={() => setEditing('new')}>Post announcement</Button>
        </div>
      )}
      {editing && (
        <AnnouncementForm
          orgId={orgId}
          announcement={editing === 'new' ? null : editing}
          onDone={() => { setEditing(null); load() }}
          onCancel={() => setEditing(null)}
        />
      )}
      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !items.length && <p className="text-neutral-500">No announcements yet.</p>}
      <div className="space-y-3">
        {items.map((a) => (
          <div key={a.id} className={`bg-white rounded-xl border p-4 ${a.pinned ? 'border-optio-purple/40' : 'border-gray-200'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {a.pinned && <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple">Pinned</span>}
                  {a.priority === 'urgent' && <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-red-100 text-red-700">Urgent</span>}
                  <h3 className="text-base font-semibold text-neutral-900">{a.title}</h3>
                </div>
                {a.body && <AnnouncementBody text={a.body} className="text-sm text-neutral-600 mt-1" />}
                <div className="text-xs text-neutral-400 mt-2">
                  {fmtDate(a.created_at)}
                  {a.publish_at && new Date(a.publish_at) > new Date() ? ` · Scheduled for ${fmtDateTime(a.publish_at)}` : ''}
                  {a.expires_at ? ` · Expires ${fmtDate(a.expires_at)}` : ''}
                </div>
              </div>
              {admin && (
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => setEditing(a)} className="text-sm text-neutral-500 hover:text-optio-purple">Edit</button>
                  <button onClick={() => remove(a)} className="text-sm text-red-500 hover:underline">Delete</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const AnnouncementForm = ({ orgId, announcement, onDone, onCancel }) => {
  const [f, setF] = useState({
    title: announcement?.title || '',
    body: announcement?.body || '',
    pinned: Boolean(announcement?.pinned),
    priority: announcement?.priority || 'normal',
    publish_at: announcement?.publish_at ? announcement.publish_at.slice(0, 16) : '',
    expires_at: announcement?.expires_at ? announcement.expires_at.slice(0, 16) : '',
    // Who to SEND it to, beyond the staff noticeboard. Empty = noticeboard only.
    notify: [],
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const save = async () => {
    if (!f.title.trim()) return toast.error('Title is required')
    setSaving(true)
    const payload = {
      organization_id: orgId,
      title: f.title,
      body: f.body,
      pinned: f.pinned,
      priority: f.priority,
      publish_at: f.publish_at ? new Date(f.publish_at).toISOString() : null,
      expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null,
      notify_audiences: f.notify,
    }
    try {
      if (announcement) await api.patch(`/api/sis/community/announcements/${announcement.id}`, payload)
      else {
        const { data } = await api.post('/api/sis/community/announcements', payload)
        if (data?.notify_error) toast.error(data.notify_error)
        else if (data?.notified?.sent) {
          toast.success(`Posted and sent to ${data.notified.sent} ${data.notified.sent === 1 ? 'person' : 'people'}`)
          return onDone()
        }
      }
      toast.success(announcement ? 'Announcement updated' : 'Announcement posted')
      onDone()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save') }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 space-y-3">
      <label className="text-xs text-neutral-500 block">Title
        <input value={f.title} onChange={(e) => set('title', e.target.value)} className={field} placeholder="Early dismissal Friday" autoFocus />
      </label>
      <div className="text-xs text-neutral-500">
        Message <span className="text-neutral-400">(optional)</span>
        <div className="mt-1">
          <RichTextEditor
            value={f.body}
            onChange={(v) => set('body', v)}
            placeholder="Share the details…"
            minHeight="110px"
            alignment={false}
          />
        </div>
      </div>
      {/* Posting to the board publishes it — families and students read the same
          board in the app. Sending is the separate, louder act: a notification
          and an email that arrive whether or not anyone opens the board. */}
      {!announcement && (
        <div className="rounded-lg border border-gray-200 bg-neutral-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Who sees this
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">
            Families and students see the board in the app. Tick a group to also send
            this to them as an announcement — a notification and an email.
          </p>
          <div className="flex flex-wrap gap-3 mt-2">
            {[['parents', 'Families'], ['students', 'Students'], ['advisors', 'Teachers']].map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-sm text-neutral-700">
                <input type="checkbox" checked={f.notify.includes(key)}
                  onChange={() => set('notify', f.notify.includes(key)
                    ? f.notify.filter((x) => x !== key)
                    : [...f.notify, key])} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={f.pinned} onChange={(e) => set('pinned', e.target.checked)} />
          Pin to top
        </label>
        <label className="text-xs text-neutral-500 block">Priority
          <select value={f.priority} onChange={(e) => set('priority', e.target.value)} className={field}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-neutral-500 block">Publish at <span className="text-neutral-400">(optional)</span>
          <input type="datetime-local" value={f.publish_at} onChange={(e) => set('publish_at', e.target.value)} className={field} />
        </label>
        <label className="text-xs text-neutral-500 block">Expires at <span className="text-neutral-400">(optional)</span>
          <input type="datetime-local" value={f.expires_at} onChange={(e) => set('expires_at', e.target.value)} className={field} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} loading={saving}>{announcement ? 'Save changes' : 'Post'}</Button>
        <button onClick={onCancel} className="text-sm text-neutral-500 hover:underline">Cancel</button>
      </div>
    </div>
  )
}

// ── Lost & Found ──────────────────────────────────────────────────────────────
const LF_STATUS = { unclaimed: 'Unclaimed', claimed: 'Claimed', donated: 'Donated' }
const lfStatusPill = (s) => ({
  unclaimed: 'bg-amber-100 text-amber-800',
  claimed: 'bg-green-100 text-green-700',
  donated: 'bg-gray-100 text-neutral-600',
}[s] || 'bg-gray-100 text-neutral-600')

const LostFoundTab = ({ orgId, admin }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // row | 'new' | null

  const load = useCallback(() => {
    setLoading(true)
    api.get(withOrg('/api/sis/community/lost-found', orgId))
      .then((r) => setItems(r.data?.items || []))
      .catch(() => toast.error('Failed to load lost & found'))
      .finally(() => setLoading(false))
  }, [orgId])
  useEffect(() => { load() }, [load])

  const setStatus = async (item, status) => {
    try {
      await api.patch(`/api/sis/community/lost-found/${item.id}`, { organization_id: orgId, status })
      load()
    } catch { toast.error('Could not update') }
  }
  const remove = async (item) => {
    if (!window.confirm('Delete this item?')) return
    try {
      await api.delete(`/api/sis/community/lost-found/${item.id}?organization_id=${orgId}`)
      toast.success('Item deleted')
      load()
    } catch { toast.error('Could not delete') }
  }
  const markExpired = async () => {
    if (!window.confirm('Mark every unclaimed item past its 14-day deadline as donated?')) return
    try {
      const r = await api.post('/api/sis/community/lost-found/mark-expired', { organization_id: orgId })
      toast.success(`${r.data?.donated || 0} item(s) marked for donation`)
      load()
    } catch { toast.error('Could not process') }
  }

  const pastDeadline = items.filter((i) => i.past_donation_deadline).length

  return (
    <div>
      {admin && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => setEditing('new')}>Add item</Button>
          {pastDeadline > 0 && (
            <button onClick={markExpired} className="text-sm font-medium text-amber-700 hover:underline">
              {pastDeadline} item(s) past the donation deadline — mark for donation
            </button>
          )}
        </div>
      )}
      {editing && (
        <LostFoundForm
          orgId={orgId}
          item={editing === 'new' ? null : editing}
          onDone={() => { setEditing(null); load() }}
          onCancel={() => setEditing(null)}
        />
      )}
      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !items.length && <p className="text-neutral-500">No lost &amp; found items yet.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((i) => (
          <div key={i.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
            {i.image_url
              ? <img src={i.image_url} alt="" className="w-full h-40 object-cover" />
              : <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-neutral-300 text-sm">No photo</div>}
            <div className="p-3 flex-1 flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${lfStatusPill(i.status)}`}>{LF_STATUS[i.status] || i.status}</span>
                {i.category && <span className="text-[11px] text-neutral-500">{i.category}</span>}
              </div>
              <p className="text-sm text-neutral-900 flex-1">{i.description}</p>
              <div className="text-xs text-neutral-500 mt-2 space-y-0.5">
                {i.location_found && <div>Found: {i.location_found}</div>}
                {i.date_found && <div>On {fmtDate(i.date_found)}</div>}
                {i.claimed_by && <div>Claimed by {i.claimed_by}</div>}
                {i.status === 'unclaimed' && i.days_until_donation != null && (
                  <div className={i.past_donation_deadline ? 'text-amber-700 font-medium' : ''}>
                    {i.past_donation_deadline
                      ? `Past donation deadline (${fmtDate(i.donation_deadline)})`
                      : `Donate in ${i.days_until_donation} day${i.days_until_donation === 1 ? '' : 's'} (${fmtDate(i.donation_deadline)})`}
                  </div>
                )}
              </div>
              {admin && (
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  {i.status !== 'claimed' && <button onClick={() => setStatus(i, 'claimed')} className="text-xs text-green-700 hover:underline">Mark claimed</button>}
                  {i.status !== 'unclaimed' && <button onClick={() => setStatus(i, 'unclaimed')} className="text-xs text-amber-700 hover:underline">Unclaim</button>}
                  {i.status !== 'donated' && <button onClick={() => setStatus(i, 'donated')} className="text-xs text-neutral-500 hover:underline">Donated</button>}
                  <button onClick={() => setEditing(i)} className="text-xs text-neutral-500 hover:text-optio-purple">Edit</button>
                  <button onClick={() => remove(i)} className="text-xs text-red-500 hover:underline">Delete</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const LostFoundForm = ({ orgId, item, onDone, onCancel }) => {
  const [f, setF] = useState({
    description: item?.description || '',
    category: item?.category || '',
    location_found: item?.location_found || '',
    date_found: item?.date_found ? String(item.date_found).slice(0, 10) : new Date().toISOString().slice(0, 10),
    status: item?.status || 'unclaimed',
    claimed_by: item?.claimed_by || '',
    image_url: item?.image_url || '',
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const r = await api.post(`/api/sis/community/lost-found/upload?organization_id=${orgId}`, form)
      set('image_url', r.data?.url || '')
      toast.success('Photo uploaded — save to publish')
    } catch (e) { toast.error(e?.response?.data?.error || 'Upload failed') }
    finally { setUploading(false) }
  }

  const save = async () => {
    if (!f.description.trim()) return toast.error('Description is required')
    setSaving(true)
    const payload = { ...f, organization_id: orgId }
    try {
      if (item) await api.patch(`/api/sis/community/lost-found/${item.id}`, payload)
      else await api.post('/api/sis/community/lost-found', payload)
      toast.success(item ? 'Item updated' : 'Item added')
      onDone()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save') }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 space-y-3">
      <label className="text-xs text-neutral-500 block">Description
        <input value={f.description} onChange={(e) => set('description', e.target.value)} className={field} placeholder="Blue water bottle with stickers" autoFocus />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-neutral-500 block">Category <span className="text-neutral-400">(optional)</span>
          <input value={f.category} onChange={(e) => set('category', e.target.value)} className={field} placeholder="Water bottle, jacket…" />
        </label>
        <label className="text-xs text-neutral-500 block">Where found <span className="text-neutral-400">(optional)</span>
          <input value={f.location_found} onChange={(e) => set('location_found', e.target.value)} className={field} placeholder="Gym, playground…" />
        </label>
        <label className="text-xs text-neutral-500 block">Date found
          <input type="date" value={f.date_found} onChange={(e) => set('date_found', e.target.value)} className={field} />
        </label>
        <label className="text-xs text-neutral-500 block">Status
          <select value={f.status} onChange={(e) => set('status', e.target.value)} className={field}>
            <option value="unclaimed">Unclaimed</option>
            <option value="claimed">Claimed</option>
            <option value="donated">Donated</option>
          </select>
        </label>
      </div>
      {f.status === 'claimed' && (
        <label className="text-xs text-neutral-500 block">Claimed by <span className="text-neutral-400">(optional)</span>
          <input value={f.claimed_by} onChange={(e) => set('claimed_by', e.target.value)} className={field} placeholder="Name" />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {f.image_url && <img src={f.image_url} alt="" className="w-16 h-16 rounded-lg object-cover" />}
        <label className="text-sm font-medium text-optio-purple hover:underline cursor-pointer">
          {uploading ? 'Uploading…' : f.image_url ? 'Replace photo' : 'Upload photo'}
          <input type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.heic,.heif" className="hidden" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} loading={saving}>{item ? 'Save changes' : 'Add item'}</Button>
        <button onClick={onCancel} className="text-sm text-neutral-500 hover:underline">Cancel</button>
      </div>
    </div>
  )
}

// ── Recognition ───────────────────────────────────────────────────────────────
const RecognitionTab = ({ orgId }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.get(withOrg('/api/sis/community/recognition', orgId))
      .then((r) => setItems(r.data?.recognition || []))
      .catch(() => toast.error('Failed to load recognition'))
      .finally(() => setLoading(false))
  }, [orgId])
  useEffect(() => { load() }, [load])

  const remove = async (r) => {
    if (!window.confirm('Delete this recognition?')) return
    try {
      await api.delete(`/api/sis/community/recognition/${r.id}?organization_id=${orgId}`)
      load()
    } catch { toast.error('Could not delete') }
  }

  return (
    <div>
      <div className="mb-4">
        <Button size="sm" onClick={() => setPosting(true)}>Post recognition</Button>
      </div>
      {posting && (
        <RecognitionModal orgId={orgId} onDone={() => { setPosting(false); load() }} onClose={() => setPosting(false)} />
      )}
      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !items.length && <p className="text-neutral-500">No recognition posts yet. Celebrate a student, teacher, or volunteer.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-pink/10 text-optio-pink">{recTypeLabel(r.type)}</span>
              <button onClick={() => remove(r)} className="text-xs text-neutral-400 hover:text-red-500">Delete</button>
            </div>
            {r.recipient_name && <div className="text-sm font-semibold text-neutral-900">{r.recipient_name}</div>}
            <p className="text-sm text-neutral-600 mt-1 whitespace-pre-wrap flex-1">{r.message}</p>
            <div className="text-xs text-neutral-400 mt-2">{fmtDate(r.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const RecognitionModal = ({ orgId, onDone, onClose }) => {
  const [f, setF] = useState({ type: 'shout_out', recipient_name: '', recipient_user_id: '', message: '' })
  const [members, setMembers] = useState([])
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    api.get(withOrg('/api/sis/community/members', orgId))
      .then((r) => setMembers(r.data?.members || []))
      .catch(() => setMembers([]))
  }, [orgId])

  const save = async () => {
    if (!f.message.trim()) return toast.error('Write a message')
    setSaving(true)
    // Prefer the picked member's name for display; keep the free-text if provided.
    const picked = members.find((m) => m.id === f.recipient_user_id)
    const payload = {
      organization_id: orgId,
      type: f.type,
      recipient_user_id: f.recipient_user_id || null,
      recipient_name: (f.recipient_name.trim() || picked?.name || null),
      message: f.message,
    }
    try {
      await api.post('/api/sis/community/recognition', payload)
      toast.success('Recognition posted')
      onDone()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not post') }
    finally { setSaving(false) }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-3">
        <h2 className="text-lg font-bold text-neutral-900">Post recognition</h2>
        <label className="text-xs text-neutral-500 block">Type
          <select value={f.type} onChange={(e) => set('type', e.target.value)} className={field}>
            {REC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <div className="text-xs text-neutral-500">
          Recipient <span className="text-neutral-400">(pick a person or type a name)</span>
          <div className="mt-1">
            <SearchSelect
              value={f.recipient_user_id}
              onChange={(id) => set('recipient_user_id', id)}
              options={members}
              getId={(o) => o.id}
              getLabel={(o) => o.name}
              placeholder="Search people…"
            />
          </div>
          <input
            value={f.recipient_name}
            onChange={(e) => set('recipient_name', e.target.value)}
            className={`${field} mt-2`}
            placeholder="…or a free-text name (e.g. a parent volunteer)"
          />
        </div>
        <label className="text-xs text-neutral-500 block">Message
          <textarea value={f.message} onChange={(e) => set('message', e.target.value)} className={`${field} min-h-[100px]`} placeholder="What are you celebrating?" autoFocus />
        </label>
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={save} loading={saving}>Post</Button>
          <button onClick={onClose} className="text-sm text-neutral-500 hover:underline">Cancel</button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ── Events (thin — reuses the existing sis_events + Calendar page) ────────────
const EventsTab = ({ orgId }) => {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const from = new Date().toISOString()
    setLoading(true)
    api.get(withOrg(`/api/sis/events?from=${from}`, orgId))
      .then((r) => setEvents(r.data?.events || []))
      .catch(() => toast.error('Failed to load events'))
      .finally(() => setLoading(false))
  }, [orgId])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-neutral-500">Upcoming events from the school calendar.</p>
        <Link to="/calendar">
          <Button size="sm" variant="secondary">Open Calendar</Button>
        </Link>
      </div>
      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !events.length && <p className="text-neutral-500">No upcoming events. Add them on the Calendar.</p>}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {events.map((e) => (
          <div key={e.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-neutral-900">{e.title}</div>
              {e.description && <div className="text-xs text-neutral-500 line-clamp-1">{e.description}</div>}
            </div>
            <div className="text-xs text-neutral-500 text-right flex-shrink-0">
              <div>{e.all_day ? fmtDate(e.start_at) : fmtDateTime(e.start_at)}</div>
              {e.location && <div>{e.location}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Resources (thin — links to the existing Resources page) ───────────────────
const ResourcesTab = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
    <p className="text-sm text-neutral-600 mb-4 max-w-md mx-auto">
      Guidebooks, forms, and links for your community live in the Resources library. Manage them there and families see them in their app.
    </p>
    <Link to="/resources">
      <Button size="sm">Open Resources</Button>
    </Link>
  </div>
)

export default CommunityPage
