import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Modal } from '../ui'
import api from '../../services/api'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * Put one training quest on the accounts of a chosen few.
 *
 * iCreate, 2026-08-17: "the option to select specific users to enroll in the
 * quest." Assigning to the whole audience is the common case and stays a single
 * button; this is for the rest — the two teachers who missed the in-person
 * session, the family who joined in October and needs orientation nobody else
 * still needs.
 *
 * It only ever lists people the training actually applies to (the backend
 * narrows by the row's visible_to_roles), and it shows who already has it so an
 * admin can see at a glance who is left. Already-enrolled people can still be
 * ticked — assignment is idempotent, so re-sending them changes nothing.
 */

export default function TrainingPeoplePicker({ item, orgId, onClose, onAssigned }) {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState(() => new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!item) return
    setLoading(true)
    api.get(withOrg(`/api/sis/training/${item.id}/people`, orgId))
      .then((r) => setPeople(r.data?.people || []))
      .catch(() => toast.error('Could not load the list of people'))
      .finally(() => setLoading(false))
  }, [item, orgId])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => `${p.name || ''} ${p.email || ''}`.toLowerCase().includes(q))
  }, [people, query])

  const toggle = (id) => setChosen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const notYetIds = people.filter((p) => !p.progress?.started).map((p) => p.user_id)

  const assign = async () => {
    if (!chosen.size) { toast.error('Choose at least one person'); return }
    setBusy(true)
    try {
      // A draft is on nobody's account and invisible to its audience, so it has
      // to go live before anybody can be given it. assign:false keeps that from
      // sweeping in the whole audience a moment before we enrol the chosen few.
      if (item.is_draft) {
        await api.post(withOrg(`/api/sis/training/${item.id}/publish`, orgId), { assign: false })
      }
      const res = await api.post(withOrg(`/api/sis/training/${item.id}/assign`, orgId),
        { user_ids: [...chosen] })
      onAssigned(res.data)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not assign it')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={!!item}
      onClose={onClose}
      title="Choose who gets this"
      size="md"
      footer={(
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-neutral-500">
            {chosen.size ? `${chosen.size} selected` : 'Nobody selected yet'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-gray-100">
              Cancel
            </button>
            <button onClick={assign} disabled={busy || !chosen.size}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold disabled:opacity-50">
              {busy ? 'Assigning…' : 'Assign to selected'}
            </button>
          </div>
        </div>
      )}
    >
      <p className="text-sm text-neutral-600 mb-3">
        <span className="font-medium text-neutral-900">{item?.title}</span> will be put
        on the accounts you tick. Anyone who already has it is left exactly as they are.
      </p>

      {item?.is_draft && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          This quest is still a draft. Assigning it will publish it, so it becomes
          visible to everyone in this audience — but only the people you tick get
          it on their account.
        </p>
      )}

      <div className="flex items-center gap-2 mb-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email" aria-label="Search people"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent" />
        {/* The common shape of this job: everyone who has not done it yet. */}
        <button type="button" onClick={() => setChosen(new Set(notYetIds))}
          disabled={!notYetIds.length}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
          Select not started
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : !people.length ? (
        <p className="text-sm text-neutral-500">Nobody here to assign this to yet.</p>
      ) : !shown.length ? (
        <p className="text-sm text-neutral-500">Nobody matches "{query}".</p>
      ) : (
        <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
          {shown.map((p) => (
            <li key={p.user_id}>
              <label className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={chosen.has(p.user_id)}
                  onChange={() => toggle(p.user_id)}
                  aria-label={`Select ${p.name}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-neutral-900 truncate">{p.name}</span>
                  {p.email && <span className="block text-xs text-neutral-500 truncate">{p.email}</span>}
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${
                  p.progress?.completed ? 'bg-green-100 text-green-700'
                    : p.progress?.started ? 'bg-amber-100 text-amber-800'
                      : 'bg-gray-100 text-neutral-500'}`}>
                  {p.progress?.completed ? 'Complete'
                    : p.progress?.started ? 'Has it' : 'Not started'}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
