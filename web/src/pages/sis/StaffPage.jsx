import React, { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { Squares2X2Icon, TableCellsIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useSisStaff } from '../../hooks/api/useSisStaff'
import { useSisOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import Button from '../../components/ui/Button'
import { RolePill } from '../../components/ui/RolePill'
import TeacherModal from '../../components/sis/TeacherModal'
import LinkStaffAccountModal from '../../components/sis/LinkStaffAccountModal'
import StaffProfileModal from '../../components/sis/StaffProfileModal'
import StaffDetailModal from '../../components/sis/StaffDetailModal'
import PersonPhoto from '../../components/sis/PersonPhoto'
import { setPreviewTeacher } from './teacherPreview'
import { useConfirm } from '../../contexts/ConfirmContext'

const fmtDate = (d) => {
  if (!d) return null
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return null }
}

const daysSince = (d) => {
  if (!d) return null
  const ms = Date.now() - new Date(d).getTime()
  if (Number.isNaN(ms)) return null
  return Math.max(0, Math.floor(ms / 86400000))
}

// How long an invite has been sitting unaccepted, in words.
const waitingFor = (d) => {
  const days = daysSince(d)
  if (days === null) return null
  if (days === 0) return 'invited today'
  if (days === 1) return 'invited yesterday'
  return `invited ${days} days ago`
}

// The office asked for "a list of teachers I've invited but haven't accepted
// yet" — that's login_pending. Placeholders (imported from a schedule sheet,
// never invited) are a different kind of incomplete, so they filter separately.
const FILTERS = [
  { key: 'all', label: 'Everyone', match: () => true },
  { key: 'active', label: 'Signed in', match: (s) => !s.is_placeholder && !s.login_pending },
  { key: 'pending', label: 'Invited, not accepted', match: (s) => !!s.login_pending },
  { key: 'placeholder', label: 'No login yet', match: (s) => !!s.is_placeholder },
]

const StatusPills = ({ s }) => (
  <>
    {s.is_placeholder && (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        No login yet
      </span>
    )}
    {s.login_pending && (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        Invite pending
      </span>
    )}
  </>
)

const StaffPage = ({ embedded = false, toolbarEl = null }) => {
  const confirm = useConfirm()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  // QF-03: staff + loading come from react-query. `refetch` is the old `load`.
  const { data: staff = [], isLoading: loading, refetch: load } = useSisStaff(orgId)
  const [adding, setAdding] = useState(false)
  // Clicking a card opens the detail modal; its footer actions hand off to the
  // edit / employment / link modals (same clickable-card pattern as Users and
  // Families).
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(null)
  const [linking, setLinking] = useState(null)
  const [managing, setManaging] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [merging, setMerging] = useState(null)   // placeholder id mid-merge
  // cards | list — the list is the scannable directory the office asked for.
  const [view, setViewState] = useState(() => {
    try { return localStorage.getItem('sis_staff_view') || 'cards' } catch { return 'cards' }
  })
  const setView = (v) => {
    setViewState(v)
    try { localStorage.setItem('sis_staff_view', v) } catch { /* ignore */ }
  }
  const navigate = useNavigate()
  const [resendingId, setResendingId] = useState(null)

  // Row/card-level resend, so chasing a stale invite doesn't mean opening
  // every person's detail modal one by one.
  const resendInvite = async (e, s) => {
    e.stopPropagation()
    setResendingId(s.id)
    try {
      await api.post(`/api/sis/staff/${s.id}/resend-invite`, { organization_id: orgId })
      toast.success(`Setup email sent to ${s.email}`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not resend the invite')
    } finally {
      setResendingId(null)
    }
  }

  const openPortalPreview = (s) => {
    setPreviewTeacher(s)
    navigate('/')
    // Sidebar + layout read the preview at render time; a reload guarantees
    // every piece of chrome picks it up.
    window.location.reload()
  }



  const closeModals = () => { setAdding(false); setEditing(null) }

  const counts = useMemo(() => Object.fromEntries(
    FILTERS.map((f) => [f.key, staff.filter(f.match).length]),
  ), [staff])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matcher = FILTERS.find((f) => f.key === filter)?.match || (() => true)
    return staff.filter((s) => matcher(s) && (
      !q || (s.name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
    ))
  }, [staff, search, filter])

  // The same person on two rows: a placeholder card holding the class
  // assignments plus a real account that was invited separately. Listed once
  // per pair, keyed by the placeholder that gets merged away.
  const duplicates = useMemo(() => (
    staff.filter((s) => s.is_placeholder && s.duplicate_of && !s.duplicate_of.is_placeholder)
  ), [staff])

  const mergeDuplicate = async (placeholder) => {
    const real = placeholder.duplicate_of
    const classes = placeholder.class_count || 0
    const ok = await confirm(
      `Merge the "${placeholder.name}" card into ${real.email}?\n\n` +
      (classes
        ? `Their ${classes} class assignment${classes === 1 ? '' : 's'} move to that account, and the duplicate card is removed.`
        : 'The duplicate card is removed; the invited account keeps everything.'),
    )
    if (!ok) return
    setMerging(placeholder.id)
    try {
      await api.post(`/api/sis/staff/${placeholder.id}/link`, {
        email: real.email,
        organization_id: orgId,
      })
      toast.success(`${placeholder.name} is now one account`)
      load()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not merge the two records')
    } finally {
      setMerging(null)
    }
  }

  return (
    <div>
      {embedded ? (
        toolbarEl && createPortal(
          <Button size="sm" onClick={() => setAdding(true)} disabled={!orgId}>Add teacher</Button>,
          toolbarEl,
        )
      ) : (
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Staff</h1>
          <div className="flex items-center gap-3">
            <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
            <Button size="sm" onClick={() => setAdding(true)} disabled={!orgId}>Add teacher</Button>
          </div>
        </div>
      )}

      {/* Same person, two rows — offer the fix instead of leaving it to be found. */}
      {duplicates.map((d) => (
        <div key={d.id} className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-amber-900 flex-1 min-w-[16rem]">
            <span className="font-semibold">{d.name}</span> is on the list twice: a card with no
            login{d.class_count ? ` holding ${d.class_count} class${d.class_count === 1 ? '' : 'es'}` : ''},
            and an invited account ({d.duplicate_of.email}). Merging keeps the invited account and
            moves the classes onto it.
          </p>
          <button
            type="button"
            onClick={() => mergeDuplicate(d)}
            disabled={merging === d.id}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:opacity-90 disabled:opacity-50"
          >
            {merging === d.id ? 'Merging…' : 'Merge into invited account'}
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
          <button onClick={() => setView('cards')} title="Card view" aria-pressed={view === 'cards'}
            className={`px-2.5 py-1.5 rounded-md transition-colors ${view === 'cards' ? 'bg-optio-purple text-white' : 'text-neutral-500 hover:bg-neutral-50'}`}>
            <Squares2X2Icon className="w-4 h-4" />
          </button>
          <button onClick={() => setView('list')} title="List view" aria-pressed={view === 'list'}
            className={`px-2.5 py-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-optio-purple text-white' : 'text-neutral-500 hover:bg-neutral-50'}`}>
            <TableCellsIcon className="w-4 h-4" />
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search staff…"
          aria-label="Search staff"
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-56 focus:ring-2 focus:ring-optio-purple focus:border-transparent"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            (f.key === 'all' || counts[f.key] > 0) && (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filter === f.key
                    ? 'bg-optio-purple text-white border-optio-purple'
                    : 'bg-white text-neutral-600 border-gray-200 hover:bg-neutral-50'}`}
              >
                {f.label} ({counts[f.key] || 0})
              </button>
            )
          ))}
        </div>
      </div>

      {loading && <p className="text-neutral-500">Loading…</p>}
      {!loading && !staff.length && (
        <p className="text-neutral-500">No org admins or teachers in this organization yet.</p>
      )}
      {!loading && staff.length > 0 && !visible.length && (
        <p className="text-neutral-500">Nobody matches that.</p>
      )}

      {view === 'list' && visible.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-4 py-2">Name</th>
                <th className="text-left font-medium px-4 py-2">Email</th>
                <th className="text-left font-medium px-4 py-2">Role</th>
                <th className="text-left font-medium px-4 py-2">Status</th>
                <th className="text-right font-medium px-4 py-2">Classes</th>
                <th className="text-left font-medium px-4 py-2">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setViewing(s)}
                  className="hover:bg-neutral-50 cursor-pointer"
                >
                  <td className="px-4 py-2 font-medium text-neutral-900 whitespace-nowrap">{s.name}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {s.is_placeholder ? <span className="text-neutral-400">—</span> : s.email}
                    {s.phone_number && (
                      <span className="block text-xs text-neutral-400">{s.phone_number}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(s.roles || []).map((r) => <RolePill key={r} role={r} />)}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusPills s={s} />
                      {s.login_pending && (
                        <span className="text-xs text-neutral-500">{waitingFor(s.created_at)}</span>
                      )}
                      {s.login_pending && (
                        <button
                          onClick={(e) => resendInvite(e, s)}
                          disabled={resendingId === s.id}
                          className="text-xs font-medium text-optio-purple hover:underline disabled:opacity-50"
                        >
                          {resendingId === s.id ? 'Sending…' : 'Resend invite'}
                        </button>
                      )}
                      {!s.is_placeholder && !s.login_pending && (
                        <span className="text-xs text-neutral-400">Signed in</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-neutral-600">{s.class_count ?? 0}</td>
                  <td className="px-4 py-2 text-neutral-500 whitespace-nowrap">
                    {fmtDate(s.last_active) || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setViewing(s)}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col text-left hover:border-optio-purple/50 hover:shadow-sm transition-all cursor-pointer"
            >
              {/* Avatar hero */}
              <div className="h-24 w-full bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 flex items-center justify-center">
                <PersonPhoto src={s.avatar_url} name={s.name} size="w-16 h-16" textSize="text-xl"
                  className="border-2 border-white shadow" />
              </div>

              {/* Body */}
              <div className="p-4 flex flex-col flex-1 text-center w-full">
                <h3 className="font-semibold text-neutral-900 truncate">{s.name}</h3>
                {s.email && !s.is_placeholder && (
                  <p className="text-sm text-neutral-500 truncate">{s.email}</p>
                )}
                {s.phone_number && (
                  <p className="text-sm text-neutral-500 truncate">{s.phone_number}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
                  {(s.roles || []).map((r) => <RolePill key={r} role={r} />)}
                  {s.staff_type === 'family' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-optio-purple/10 text-optio-purple">
                      Family
                    </span>
                  )}
                  <StatusPills s={s} />
                </div>
                {s.login_pending && waitingFor(s.created_at) && (
                  <p className="mt-1 text-xs text-neutral-500">{waitingFor(s.created_at)}</p>
                )}
                {s.login_pending && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => resendInvite(e, s)}
                    onKeyDown={(e) => { if (e.key === 'Enter') resendInvite(e, s) }}
                    className="mt-0.5 text-xs font-medium text-optio-purple hover:underline"
                  >
                    {resendingId === s.id ? 'Sending…' : 'Resend invite'}
                  </span>
                )}
                {s.bio && <p className="mt-2 text-sm text-neutral-600 line-clamp-3">{s.bio}</p>}
                {fmtDate(s.last_active) && (
                  <p className="mt-auto pt-3 text-xs text-neutral-400">Active {fmtDate(s.last_active)}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {!loading && staff.length > 0 && (
        <p className="text-sm text-neutral-400 mt-3">
          {visible.length === staff.length
            ? `${staff.length} staff member${staff.length === 1 ? '' : 's'}`
            : `${visible.length} of ${staff.length} staff members`}
        </p>
      )}

      {viewing && (
        <StaffDetailModal
          orgId={orgId}
          staff={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null) }}
          onEmployment={() => { setManaging(viewing); setViewing(null) }}
          onLink={() => { setLinking(viewing); setViewing(null) }}
          onViewPortal={() => openPortalPreview(viewing)}
          onRemoved={() => { setViewing(null); load() }}
          onRolesChanged={() => { setViewing(null); load() }}
        />
      )}

      {(adding || editing) && (
        <TeacherModal
          orgId={orgId}
          initial={editing}
          placeholders={staff.filter((s) => s.is_placeholder)}
          onClose={closeModals}
          onSaved={() => { closeModals(); load() }}
        />
      )}

      {linking && (
        <LinkStaffAccountModal
          orgId={orgId}
          staff={linking}
          onClose={() => setLinking(null)}
          onLinked={() => { setLinking(null); load() }}
        />
      )}

      {managing && (
        <StaffProfileModal
          orgId={orgId}
          staff={managing}
          onClose={() => setManaging(null)}
          onSaved={() => { setManaging(null); load() }}
        />
      )}
    </div>
  )
}

export default StaffPage
