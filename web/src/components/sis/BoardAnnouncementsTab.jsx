import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCommunityAnnouncements, sisCommunityApi, invalidateCommunity,
} from '../../hooks/api/useSisCommunity'
import Button from '../../components/ui/Button'
import { useSisOrg } from '../../pages/sis/useSisOrg'
import RichTextEditor from '../course/outline/RichTextEditor'
import AnnouncementBody from '../announcements/AnnouncementBody'
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * Posting an announcement. One composer, mounted in two places.
 *
 * There used to be two, and the office had to decide which one they wanted
 * before they had written anything: a BOARD post on /community, and a targeted
 * SEND on /inbox that could pick classes, teachers and age bands. They were two
 * composers for one act, with two different audience models, and iCreate said
 * so plainly ("I think we may be getting confused with messaging and
 * announcements?", 2026-09-02).
 *
 * An announcement is now one thing: a notice on the board that stays up for the
 * school year, with an optional "also notify" for something that cannot wait.
 * Reaching a particular set of people is what messaging is for, and the SIS
 * console can now write to a chosen group.
 *
 * Lives in components/ rather than on either page because /community is opt-in
 * per org: a school with the Community Hub switched off still posts
 * announcements, from /inbox.
 */

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const isDateOnly = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))

const fmtDate = (v, { utc = false } = {}) => {
  if (!v) return ''
  const d = new Date(isDateOnly(v) ? `${v}T12:00:00` : v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}),
  })
}

const fmtDateTime = (v) => {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const BoardAnnouncementsTab = ({ orgId, admin }) => {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null) // row | 'new' | null

  const { data: items = [], isPending: loading, isError } = useCommunityAnnouncements(orgId)
  useEffect(() => { if (isError) toast.error('Failed to load announcements') }, [isError])
  const load = useCallback(
    () => invalidateCommunity(queryClient, orgId), [queryClient, orgId],
  )

  const remove = async (a) => {
    if (!(await confirm(`Delete "${a.title}"?`))) return
    try {
      await sisCommunityApi.deleteAnnouncement(a.id, orgId)
      toast.success('Announcement deleted')
      load()
    } catch { toast.error('Could not delete') }
  }

  return (
    <div>
      {admin && (
        <div className="mb-4 flex items-center gap-3 flex-wrap">
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
  const { activeOrg } = useSisOrg()
  const lastDay = activeOrg?.feature_flags?.sis_settings?.last_day_of_school || ''
  const [f, setF] = useState({
    title: announcement?.title || '',
    body: announcement?.body || '',
    pinned: Boolean(announcement?.pinned),
    priority: announcement?.priority || 'normal',
    audience: announcement?.audience || 'school',
    publish_at: announcement?.publish_at ? announcement.publish_at.slice(0, 16) : '',
    expires_at: announcement?.expires_at ? announcement.expires_at.slice(0, 16) : '',
    // Whether to ALSO push it, beyond the board. The board audience above
    // already says who the notice is for; asking again in a second vocabulary
    // is how three composers with three different audience models came to
    // exist. Off by default: a board post is a thing people come and read.
    notify: false,
    notify_app: true,
    notify_email: false,
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
      audience: f.audience,
      publish_at: f.publish_at ? new Date(f.publish_at).toISOString() : null,
      expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null,
      notify: f.notify,
      notify_app: f.notify_app,
      notify_email: f.notify_email,
    }
    try {
      if (announcement) await sisCommunityApi.saveAnnouncement(announcement.id, payload)
      else {
        const { data } = await sisCommunityApi.saveAnnouncement(null, payload)
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
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={f.notify} className="mt-0.5"
              disabled={f.audience === 'admins'}
              onChange={(e) => set('notify', e.target.checked)} />
            <span>
              Also notify people
              <span className="block text-xs text-neutral-500">
                {f.audience === 'admins'
                  ? 'Admin-only posts stay on the board — there is nobody to notify.'
                  : 'The board is where people come and read. Tick this for something that cannot wait.'}
              </span>
            </span>
          </label>
          {f.notify && f.audience !== 'admins' && (
            <div className="flex flex-wrap gap-4 mt-2 pl-6">
              <label className="flex items-center gap-1.5 text-sm text-neutral-700">
                <input type="checkbox" checked={f.notify_app}
                  onChange={(e) => set('notify_app', e.target.checked)} />
                In the app
              </label>
              <label className="flex items-center gap-1.5 text-sm text-neutral-700">
                <input type="checkbox" checked={f.notify_email}
                  onChange={(e) => set('notify_email', e.target.checked)} />
                By email
              </label>
            </div>
          )}
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
        {/* Who can READ the board post. Separate from "send it to", below:
            posting to the board and sending a notification are two acts. Board
            posts had no audience at all, so a note for teachers was readable by
            every family in the app (iCreate, 2026-08-26). */}
        <label className="text-xs text-neutral-500 block">Visible to
          <select value={f.audience} onChange={(e) => set('audience', e.target.value)} className={field}>
            <option value="school">Everyone at the school</option>
            <option value="teachers">Staff only</option>
            <option value="admins">Admins only</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-neutral-500 block">Publish at <span className="text-neutral-400">(optional)</span>
          <input type="datetime-local" value={f.publish_at} onChange={(e) => set('publish_at', e.target.value)} className={field} />
        </label>
        <label className="text-xs text-neutral-500 block">Expires at <span className="text-neutral-400">(optional)</span>
          <input type="datetime-local" value={f.expires_at} onChange={(e) => set('expires_at', e.target.value)} className={field} />
          {/* Left blank the server uses the end of the school year, so this
              year's notices stay up and then come down. Saying which date that
              is beats leaving "optional" to mean "forever" silently. */}
          <span className="block mt-1 text-neutral-400">
            {lastDay
              ? `Blank: comes down at the end of the school year (${lastDay}).`
              : 'Blank: stays up until you remove it.'}
          </span>
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} loading={saving}>{announcement ? 'Save changes' : 'Post'}</Button>
        <button onClick={onCancel} className="text-sm text-neutral-500 hover:underline">Cancel</button>
      </div>
    </div>
  )
}

export default BoardAnnouncementsTab
