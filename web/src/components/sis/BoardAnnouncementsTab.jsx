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
import { fmtDateOnly, fmtShortDate, fmtInstant, isDateOnly } from '../../utils/timeFormat'
import { INPUT_CLASS } from '../ui/Input'
import useIsClamped from '../../hooks/useIsClamped'

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

const field = INPUT_CLASS
// Who can READ the board post, and -- because it is one vocabulary, not two --
// who "Also notify people" reaches. Kept in step with services/sis_audiences.py
// (BOARD_AUDIENCES and recipient_roles_for): the server derives the send from
// this same choice, so a label here that disagrees with it is a lie about what
// Post does.
const AUDIENCES = [
  { value: 'school', label: 'Everyone at the school', reach: 'parents, students and teachers' },
  { value: 'families', label: 'Families', reach: 'parents' },
  { value: 'teachers', label: 'Staff only', reach: 'teachers' },
]

// "Admins only" was retired on 2026-09-13; it read the same as staff-only on the
// board and had nobody to notify. Editing a post written before that must not
// drop it back to the default, which is everyone at the school.
const LEGACY_AUDIENCE = { admins: 'teachers' }

const reachOf = (value) => AUDIENCES.find((a) => a.value === value)?.reach
// The chip on a posted item saying who can see it. The whole-school default
// needs no chip; a narrower post does, because the list otherwise gave no way
// to tell a staff-only notice from one every family reads (iCreate, 597ba9a4).
const audienceChip = (value) => {
  const v = LEGACY_AUDIENCE[value] || value || 'school'
  if (v === 'school') return null
  return AUDIENCES.find((a) => a.value === v)?.label || v
}

// Posted / scheduled / expires stamps: a day-only value is a day, an instant
// is an instant, both from utils/timeFormat.js (this file and CommunityPage
// each had their own pair with the same names and different algorithms, M12).
const fmtDate = (v) => (isDateOnly(v) ? fmtDateOnly(v, 'short').replace(/, \d{4}$/, '') : fmtShortDate(v))
const fmtDateTime = fmtInstant

// How the list is ordered, and what narrows it. Pinned stays on top of every
// order: it is the office saying "read this first", which a sort must not
// overrule (the server already returns pinned-first, newest-first).
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'By title' },
]

const sortItems = (items, sort) => {
  const at = (a) => new Date(a.created_at || 0).getTime()
  const ordered = [...items]
  if (sort === 'oldest') ordered.sort((a, b) => at(a) - at(b))
  else if (sort === 'title') ordered.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  else ordered.sort((a, b) => at(b) - at(a))
  ordered.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
  return ordered
}

/**
 * One posted announcement.
 *
 * Its own component so it can hold its own collapsed state: the board renders
 * every notice at full length, and a term's worth of them is a page you scroll
 * past rather than read ("I thought we had it so the announcements could be
 * sorted and collapsed?" -- iCreate, 2026-09-22, d0a27882). A long body clamps
 * to four lines with a Show more; a short one is left alone, because a button
 * that expands nothing is its own complaint (eb48ad83, same day).
 */
const AnnouncementItem = ({ a, admin, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false)
  const [bodyRef, isClamped] = useIsClamped(a.body, expanded)

  return (
    <div className={`bg-white rounded-xl border p-4 ${a.pinned ? 'border-optio-purple/40' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {a.pinned && <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-optio-purple/10 text-optio-purple">Pinned</span>}
            {a.priority === 'urgent' && <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-red-100 text-red-700">Urgent</span>}
            {audienceChip(a.audience) && (
              <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-gray-100 text-neutral-600"
                title={`Seen by ${reachOf(LEGACY_AUDIENCE[a.audience] || a.audience)}`}>
                {audienceChip(a.audience)}
              </span>
            )}
            <h3 className="text-base font-semibold text-neutral-900">{a.title}</h3>
          </div>
          {a.body && (
            <div ref={bodyRef} className={expanded ? '' : 'line-clamp-4'}>
              <AnnouncementBody text={a.body} className="text-sm text-neutral-600 mt-1" />
            </div>
          )}
          {a.body && (isClamped || expanded) && (
            <button type="button" onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-semibold text-optio-purple hover:text-optio-pink">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          <div className="text-xs text-neutral-400 mt-2">
            {fmtDate(a.created_at)}
            {a.publish_at && new Date(a.publish_at) > new Date() ? ` \u00b7 Scheduled for ${fmtDateTime(a.publish_at)}` : ''}
            {a.expires_at ? ` \u00b7 Expires ${fmtDate(a.expires_at)}` : ''}
          </div>
        </div>
        {admin && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <button onClick={() => onEdit(a)} className="text-sm text-neutral-500 hover:text-optio-purple">Edit</button>
            <button onClick={() => onDelete(a)} className="text-sm text-red-500 hover:underline">Delete</button>
          </div>
        )}
      </div>
    </div>
  )
}

const BoardAnnouncementsTab = ({ orgId, admin }) => {
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null) // row | 'new' | null
  const [sort, setSort] = useState('newest')
  const [audienceFilter, setAudienceFilter] = useState('')

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

  const shown = sortItems(
    audienceFilter
      ? items.filter((a) => (LEGACY_AUDIENCE[a.audience] || a.audience || 'school') === audienceFilter)
      : items,
    sort,
  )

  return (
    <div>
      {admin && (
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <Button size="sm" onClick={() => setEditing('new')}>Post announcement</Button>
        </div>
      )}
      {/* Sorting and narrowing the board. A school year's notices are a long
          page, and the only order on offer was the one the server chose
          (d0a27882). Hidden below two items, where a control is just noise. */}
      {items.length > 2 && (
        <div className="mb-3 flex items-center gap-2 flex-wrap text-xs text-neutral-500">
          <label className="flex items-center gap-1.5">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              aria-label="Sort announcements"
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
              {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Show
            <select value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)}
              aria-label="Filter announcements by audience"
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
              <option value="">All announcements</option>
              {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
          <span className="text-neutral-400">
            {shown.length} of {items.length}
          </span>
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
      {/* Without an org the query never runs, so "Loading…" would never end. */}
      {!orgId && <p className="text-neutral-500">Pick a school to see its announcements.</p>}
      {orgId && loading && <p className="text-neutral-500">Loading…</p>}
      {orgId && !loading && !items.length && <p className="text-neutral-500">No announcements yet.</p>}
      {orgId && !loading && items.length > 0 && !shown.length && (
        <p className="text-neutral-500">No announcements for that audience.</p>
      )}
      <div className="space-y-3">
        {shown.map((a) => (
          <AnnouncementItem key={a.id} a={a} admin={admin}
            onEdit={setEditing} onDelete={remove} />
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
    audience: LEGACY_AUDIENCE[announcement?.audience] || announcement?.audience || 'school',
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
      {/* Posting to the board publishes it, to whoever "Visible to" names.
          Sending is the separate, louder act: a notification and an email that
          arrive whether or not anyone opens the board. Who it reaches is that
          same setting and nothing else — one audience, asked once. Saying the
          answer back here is what the office was missing: "does the newsletter
          go to the teachers?" had no answer anywhere on the form. */}
      {!announcement && (
        <div className="rounded-lg border border-gray-200 bg-neutral-50 p-3">
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={f.notify} className="mt-0.5"
              onChange={(e) => set('notify', e.target.checked)} />
            <span>
              Also notify people
              <span className="block text-xs text-neutral-500">
                The board is where people come and read. Tick this for something
                that cannot wait.
              </span>
            </span>
          </label>
          {f.notify && (
            <div className="mt-2 pl-6">
              <div className="flex flex-wrap gap-4">
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
              {/* The same audience, so the same people: "Visible to" below
                  now names them whether or not this box is ticked. Said here
                  as what the notification ADDS, rather than repeating the
                  reach twice on one form. */}
              <p className="text-xs text-neutral-500 mt-1.5">
                Sent to the same people the post is visible to, now, rather than
                waiting for them to open the board.
              </p>
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
        {/* Who can READ the board post, and who "Also notify people" above
            reaches. Board posts had no audience at all, so a note for teachers
            was readable by every family in the app (iCreate, 2026-08-26).
            "Families" means the parents: the weekly newsletter is not news a
            teacher needs pushed to their phone. */}
        <label className="text-xs text-neutral-500 block">Visible to
          <select value={f.audience} onChange={(e) => set('audience', e.target.value)} className={field}>
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          {/* Who that actually is. The reach was written down but only ever
              rendered inside "Also notify people", so anyone who left that off
              had to guess -- "Does 'Everyone at School' include students too?"
              (iCreate, 2026-09-22, 745e2857). The names are the school's
              words; only this line says who receives it. */}
          <span className="block mt-1 text-neutral-400">Goes to {reachOf(f.audience)}.</span>
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
