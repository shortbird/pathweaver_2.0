import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

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
 */
export default function EventRsvp({ event, orgId }) {
  const [mine, setMine] = useState(null)   // null = not asked yet
  const [open, setOpen] = useState(false)
  const [party, setParty] = useState(1)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const base = `/api/sis/parent/events/${event.id}/rsvp`

  const load = useCallback(() => {
    api.get(base, { params: { organization_id: orgId } })
      .then((r) => {
        const rsvp = r.data?.rsvp || null
        setMine(rsvp)
        if (rsvp) {
          setParty(rsvp.party_size || 1)
          setNote(rsvp.note || '')
        }
      })
      .catch(() => setMine(null))
  }, [base, orgId])

  useEffect(() => { if (event.rsvp_enabled) load() }, [event.rsvp_enabled, load])

  if (!event.rsvp_enabled) return null

  const closed = event.rsvp_closes_at && new Date(event.rsvp_closes_at) < new Date()
  const fee = event.rsvp_fee_cents

  const send = async (attending) => {
    setBusy(true)
    try {
      const { data } = await api.post(base, {
        organization_id: orgId,
        attending,
        party_size: attending ? Number(party) || 1 : 1,
        note: note.trim() || null,
      })
      setMine(data.rsvp || null)
      setOpen(false)
      // Naming the charge matters: a family that says yes to a paid event and
      // hears nothing about money assumes it was free.
      toast.success(data.invoice
        ? `Thanks — $${((fee || 0) / 100).toFixed(2)} has been added to your billing page`
        : attending ? 'Thanks — we have you down' : 'Thanks for letting us know')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not send that')
    } finally { setBusy(false) }
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      {mine && (
        <p className="text-xs text-neutral-600 mb-1">
          {mine.attending
            ? `You are coming${mine.party_size > 1 ? ` — ${mine.party_size} people` : ''}.`
            : 'You said you cannot make it.'}
          {mine.invoice_id && ' Charged to your billing page.'}
        </p>
      )}

      {closed ? (
        <p className="text-xs text-neutral-400">Replies have closed.</p>
      ) : open ? (
        <div className="space-y-1.5">
          <label className="block text-xs text-neutral-500">
            How many of you?
            <input type="number" min="1" max="50" value={party}
              onChange={(e) => setParty(e.target.value)}
              aria-label="How many people"
              className="ml-2 w-16 rounded border border-gray-300 px-1.5 py-0.5 text-sm" />
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Anything we should know? (optional)"
            aria-label="Note for the school"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          {fee > 0 && (
            <p className="text-xs text-neutral-500">
              ${(fee / 100).toFixed(2)} will be added to your billing page.
              {mine?.invoice_id && ' You have already been charged for this event.'}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => send(true)} disabled={busy}
              className="px-3 py-1 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-xs font-semibold disabled:opacity-50">
              {mine?.attending ? 'Update' : 'We are coming'}
            </button>
            <button onClick={() => send(false)} disabled={busy}
              className="px-3 py-1 rounded-lg border border-gray-300 text-xs text-neutral-600 disabled:opacity-50">
              Can&apos;t make it
            </button>
            <button onClick={() => setOpen(false)}
              className="text-xs text-neutral-400 hover:text-neutral-600">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)}
          className="text-xs font-semibold text-optio-purple hover:underline">
          {mine ? 'Change your reply' : fee > 0 ? `RSVP — $${(fee / 100).toFixed(2)}` : 'RSVP'}
        </button>
      )}
    </div>
  )
}
