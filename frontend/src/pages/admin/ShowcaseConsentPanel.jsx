import React, { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  fetchConsentList,
  fetchConsentDetail,
  upsertConsent,
  adminRevokeConsent,
  setShowcasePermission,
} from '../../services/showcaseService'

const TIER_FIELDS = [
  { key: 'consent_active', label: 'Consent active', help: 'Master switch. Off = revoked.' },
  { key: 'consent_work', label: 'Show work', help: 'Display the actual evidence content.' },
  { key: 'consent_first_name', label: 'Show first name', help: 'May reference the student by first name.' },
  { key: 'consent_face', label: 'Show face', help: 'Image may show the student\'s face.' },
  { key: 'consent_age', label: 'Show age', help: 'May display age or grade level.' },
]

const ConsentRow = ({ row, onClick, isSelected }) => {
  const c = (row.showcase_consent || [])[0] || row.showcase_consent
  const active = c && c.consent_active
  const revoked = c && c.revoked_at
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.display_name || row.email

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 border-b border-gray-200 ${isSelected ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-medium text-sm text-gray-900 truncate">{name}</div>
          <div className="text-xs text-gray-500 truncate">{row.email}</div>
        </div>
        <div className="flex-shrink-0 ml-2">
          {active ? (
            <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Active</span>
          ) : revoked ? (
            <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">Revoked</span>
          ) : (
            <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">No consent</span>
          )}
        </div>
      </div>
    </button>
  )
}

const ConsentEditor = ({ studentId, onChanged }) => {
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setDetail(null)
    setForm(null)
    try {
      const d = await fetchConsentDetail(studentId)
      setDetail(d)
      const c = d.consent || {}
      setForm({
        consent_active: !!c.consent_active,
        consent_work: !!c.consent_work,
        consent_first_name: !!c.consent_first_name,
        consent_face: !!c.consent_face,
        consent_age: !!c.consent_age,
        consent_doc_url: c.consent_doc_url || '',
        consent_signed_date: c.consent_signed_date ? c.consent_signed_date.slice(0, 10) : '',
      })
    } catch (e) {
      toast.error('Failed to load consent')
    }
  }, [studentId])

  useEffect(() => {
    load()
  }, [load])

  if (!form || !detail) {
    return <div className="p-6 text-center text-gray-500">Loading…</div>
  }

  const save = async () => {
    setBusy(true)
    try {
      await upsertConsent(studentId, {
        ...form,
        consent_signed_date: form.consent_signed_date || null,
      })
      toast.success('Consent saved')
      onChanged?.()
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    const reason = prompt('Reason for revocation?')
    if (reason === null) return
    setBusy(true)
    try {
      const r = await adminRevokeConsent(studentId, reason || 'admin revoked')
      toast.success(`Revoked. ${r.posts_flagged_for_takedown} post(s) flagged for take-down, ${r.queue_items_dismissed} queue item(s) dismissed.`)
      onChanged?.()
      load()
    } catch (e) {
      toast.error('Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      <div>
        <h3 className="text-lg font-bold">Consent state</h3>
        <p className="text-xs text-gray-500">All flags are admin-set. The legal doc is the source of truth.</p>
      </div>

      <div className="space-y-3">
        {TIER_FIELDS.map((f) => (
          <label key={f.key} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
              className="mt-1"
            />
            <div>
              <div className="font-medium text-sm">{f.label}</div>
              <div className="text-xs text-gray-500">{f.help}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="border-t pt-4 space-y-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Consent doc URL</label>
          <input
            type="url"
            value={form.consent_doc_url}
            onChange={(e) => setForm({ ...form, consent_doc_url: e.target.value })}
            placeholder="https://..."
            className="w-full px-2 py-1 text-sm border rounded"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">Signed date</label>
          <input
            type="date"
            value={form.consent_signed_date}
            onChange={(e) => setForm({ ...form, consent_signed_date: e.target.value })}
            className="px-2 py-1 text-sm border rounded"
          />
        </div>
      </div>

      <div className="flex gap-2 border-t pt-4">
        <button
          onClick={save}
          disabled={busy}
          className="px-3 py-1.5 text-sm rounded bg-optio-purple text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {detail.consent && detail.consent.consent_active && (
          <button
            onClick={revoke}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded border border-red-300 text-red-600 disabled:opacity-50"
          >
            Revoke
          </button>
        )}
      </div>

      {detail.history && detail.history.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-bold mb-2">History</h4>
          <div className="space-y-1 text-xs">
            {detail.history.map((h) => (
              <div key={h.id} className="p-2 border rounded">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{h.action}</span>
                  <span className="text-gray-500">{h.source}</span>
                  <span className="ml-auto text-gray-400">{new Date(h.changed_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const PermissionGrant = () => {
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const grant = async () => {
    const userId = prompt('User ID to grant showcase access:')
    if (!userId) return
    setBusy(true)
    try {
      await setShowcasePermission(userId, true)
      toast.success('Granted')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    const userId = prompt('User ID to revoke showcase access:')
    if (!userId) return
    setBusy(true)
    try {
      await setShowcasePermission(userId, false)
      toast.success('Revoked')
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-3 bg-purple-50 border border-purple-200 rounded">
      <div className="text-xs text-purple-700 mb-2 font-medium">Marketer access (can_view_showcase flag)</div>
      <div className="flex gap-2">
        <button onClick={grant} disabled={busy} className="px-3 py-1 text-xs rounded bg-optio-purple text-white">
          Grant
        </button>
        <button onClick={revoke} disabled={busy} className="px-3 py-1 text-xs rounded border">
          Revoke
        </button>
      </div>
    </div>
  )
}

const ShowcaseConsentPanel = () => {
  const [students, setStudents] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 })
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchConsentList({
        page: pagination.page,
        limit: pagination.limit,
        search: search || undefined,
        activeOnly,
      })
      setStudents(r.students || [])
      setPagination((p) => ({ ...p, total: r.pagination.total, pages: r.pagination.pages }))
    } catch (e) {
      toast.error('Failed to load consent list')
    } finally {
      setLoading(false)
    }
  }, [pagination.page, pagination.limit, search, activeOnly])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-12 md:col-span-5 lg:col-span-4 space-y-3">
        <PermissionGrant />

        <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-2">
          <input
            type="text"
            placeholder="Search students..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPagination((p) => ({ ...p, page: 1 }))
            }}
            className="w-full px-2 py-1 text-sm border rounded"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active consent only
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-gray-500 text-sm">Loading…</div>
          ) : students.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No students.</div>
          ) : (
            <>
              <div className="text-xs text-gray-500 px-3 py-2 bg-gray-50 border-b">
                {pagination.total} total
              </div>
              {students.map((row) => (
                <ConsentRow
                  key={row.id}
                  row={row}
                  isSelected={selectedId === row.id}
                  onClick={() => setSelectedId(row.id)}
                />
              ))}
              {pagination.pages > 1 && (
                <div className="flex items-center justify-between p-2 border-t">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                    className="px-2 py-1 text-xs rounded border disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <span className="text-xs text-gray-500">{pagination.page} / {pagination.pages}</span>
                  <button
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                    className="px-2 py-1 text-xs rounded border disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <main className="col-span-12 md:col-span-7 lg:col-span-8 bg-white border border-gray-200 rounded-lg min-h-[500px]">
        {selectedId ? (
          <ConsentEditor studentId={selectedId} onChanged={reload} />
        ) : (
          <div className="p-12 text-center text-gray-400 text-sm">
            Select a student to view or edit their showcase consent.
          </div>
        )}
      </main>
    </div>
  )
}

export default ShowcaseConsentPanel
