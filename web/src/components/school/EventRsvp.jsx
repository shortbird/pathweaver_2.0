import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { spotsLeftText } from '@shared/eventRsvp'

/**
 * A family answering an invitation, and paying for it where there is a charge.
 *
 * iCreate, 2026-08-28 (9cf78e9a): "The ability to add a form for collecting
 * RSVPs and payments to the calendar events would be good."
 *
 * Three questions, because an RSVP is always the same three: are you coming,
 * how many of you, anything we should know. A fee is raised as an ordinary
 * family charge and paid in the billing portal the family already uses — not a
 * second checkout to learn, and not a second ledger for the office to balance.
 *
 * An event can instead ask WHICH children are coming (rsvp_mode 'children';
 * Apogee NoCo's SPARK excursions, 2026-10-16): the family ticks its own
 * children, and can change the ticks until replies close. When spots run out
 * the event says Full; a family already signed up can still take children off.
 */
export default function EventRsvp({ event, orgId, onChange }) {
  const [mine, setMine] = useState(null)   // null = not asked yet
  const [children, setChildren] = useState(null)
  const [spotsLeft, setSpotsLeft] = useState(event.rsvp_spots_left ?? null)
  const [open, setOpen] = useState(false)
  const [party, setParty] = useState(1)
  const [picked, setPicked] = useState([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const base = `/api/sis/parent/events/${event.id}/rsvp`
  const childMode = event.rsvp_mode === 'children'

  const load = useCallback(() => {
    api.get(base, { params: { organization_id: orgId } })
      .then((r) => {
        const rsvp = r.data?.rsvp || null
        setMine(rsvp)
        if (r.data?.children) setChildren(r.data.children)
        if (r.data && 'spots_left' in r.data) setSpotsLeft(r.data.spots_left)
        if (rsvp) {
          setParty(rsvp.party_size || 1)
          setNote(rsvp.note || '')
          setPicked(rsvp.attending ? (rsvp.student_ids || []) : [])
        }
      })
      .catch(() => setMine(null))
  }, [base, orgId])

  useEffect(() => { if (event.rsvp_enabled) load() }, [event.rsvp_enabled, load])

  if (!event.rsvp_enabled) return null

  const closed = event.rsvp_closes_at && new Date(event.rsvp_closes_at) < new Date()
  const fee = event.rsvp_fee_cents
  const alreadyIn = !!mine?.attending
  // Full means no NEW sign-ups. A family already in keeps its door open, so it
  // can change who is coming or drop out.
  const full = spotsLeft === 0 && !alreadyIn
  const spotsText = spotsLeftText({ rsvp_spots_left: spotsLeft })
  const childName = (id) => (children || []).find((c) => c.id === id)?.name

  const toggleChild = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const send = async (attending) => {
    if (attending && childMode && !picked.length) {
      toast.error('Pick at least one child who is coming')
      return
    }
    setBusy(true)
    try {
      const { data } = await api.post(base, {
        organization_id: orgId,
        attending,
        party_size: attending ? Number(party) || 1 : 1,
        ...(childMode ? { student_ids: attending ? picked : [] } : {}),
        note: note.trim() || null,
      })
      setMine(data.rsvp || null)
      setOpen(false)
      load()
      onChange?.()
      // Naming the charge matters: a family that says yes to a paid event and
      // hears nothing about money assumes it was free.
      toast.success(data.invoice
        ? `Thanks — $${((fee || 0) / 100).toFixed(2)} has been added to your billing page`
        : attending ? 'Thanks — we have you down' : 'Thanks for letting us know')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send that')
      if (err?.response?.data?.full) load()
    } finally { setBusy(false) }
  }

  const summary = () => {
    if (!mine.attending) return 'You said you cannot make it.'
    if (childMode) {
      const names = (mine.student_ids || []).map(childName).filter(Boolean)
      return names.length ? `Signed up: ${names.join(', ')}.` : 'You are signed up.'
    }
    return `You are coming${mine.party_size > 1 ? ` — ${mine.party_size} people` : ''}.`
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      {mine && (
        <p className="text-xs text-neutral-600 mb-1">
          {summary()}
          {mine.invoice_id && ' Charged to your billing page.'}
        </p>
      )}
      {spotsText && !closed && !full && (
        <p className="text-xs mb-1 text-neutral-500">{spotsText}</p>
      )}

      {closed ? (
        <p className="text-xs text-neutral-400">Replies have closed.</p>
      ) : open ? (
        <div className="space-y-1.5">
          {childMode ? (
            <fieldset>
              <legend className="text-xs text-neutral-500 mb-1">Who is coming?</legend>
              {children === null ? (
                <p className="text-xs text-neutral-400">Loading…</p>
              ) : children.length === 0 ? (
                <p className="text-xs text-neutral-500">
                  We could not find your children at this school. Contact the school to sign up.
                </p>
              ) : (
                <div className="space-y-1">
                  {children.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input type="checkbox" checked={picked.includes(c.id)}
                        onChange={() => toggleChild(c.id)}
                        className="h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          ) : (
            <label className="block text-xs text-neutral-500">
              How many of you?
              <input type="number" min="1" max="50" value={party}
                onChange={(e) => setParty(e.target.value)}
                aria-label="How many people"
                className="ml-2 w-16 rounded border border-gray-300 px-1.5 py-0.5 text-sm" />
            </label>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Anything we should know? (optional)"
            aria-label="Note for the school"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          {fee > 0 && (
            <p className="text-xs text-neutral-500">
              ${(fee / 100).toFixed(2)} per family will be added to your billing page.
              {mine?.invoice_id && ' You have already been charged for this event.'}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => send(true)} disabled={busy}
              className="px-3 py-1 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs font-semibold disabled:opacity-50">
              {alreadyIn ? 'Update' : childMode ? 'Sign up' : 'We are coming'}
            </button>
            <button onClick={() => send(false)} disabled={busy}
              className="px-3 py-1 rounded-lg border border-gray-300 text-xs text-neutral-600 disabled:opacity-50">
              Can&apos;t make it
            </button>
            <button onClick={() => setOpen(false)}
              className="text-xs text-neutral-400 hover:text-neutral-600">Cancel</button>
          </div>
        </div>
      ) : full ? (
        <p className="text-xs font-semibold text-amber-700">This event is full.</p>
      ) : (
        <button onClick={() => setOpen(true)}
          className="text-xs font-semibold text-optio-purple hover:underline">
          {mine ? 'Change your reply'
            : childMode ? (fee > 0 ? `Sign up — $${(fee / 100).toFixed(2)}` : 'Sign up')
              : fee > 0 ? `RSVP — $${(fee / 100).toFixed(2)}` : 'RSVP'}
        </button>
      )}
    </div>
  )
}
