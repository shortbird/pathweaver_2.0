import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'

import api from '../services/api'
import { withOrg } from '../pages/sis/useSisOrg'

/**
 * The creator's order of a school's training catalog, quests and links in
 * one list.
 *
 * Every row carries sequence_order on one shared scale, written by PUT
 * /api/sis/training/order (a quest's own column; a link's sort_order, which
 * the API presents under the same name), so sorting by that number gives
 * the arranged order whatever kind each row is (Molly, iCreate, 2026-09-17,
 * b26c05e3: "I entered them in numerical order but then they..."). Ties
 * (rows never arranged) fall back to quests first, then title, which is what
 * the page showed before there was an order to keep. The server sends the
 * list already in this order; the sort here is what keeps a just-moved row
 * in place while the save is in flight.
 *
 * `move(row, delta)` swaps a row with its neighbour inside its category and
 * saves the whole arranged list. Optimistic: the row moves at once through
 * `orderOverride`, which is dropped whenever the page reloads its quests
 * (`training` changes) -- after a failure, which reloads, or the next time
 * anything else on the page reloads, by which time the saved order is what
 * comes back.
 *
 * Returns { ordered, move }.
 */
export default function useTrainingOrder({ training, orgId, reload }) {
  const [orderOverride, setOrderOverride] = useState(null) // {`${kind}:${id}`: index} while a move saves
  useEffect(() => { setOrderOverride(null) }, [training])

  const ordered = useMemo(() => {
    const pos = (r) => (orderOverride && orderOverride[`${r.kind}:${r.id}`] !== undefined)
      ? orderOverride[`${r.kind}:${r.id}`]
      : (Number.isFinite(Number(r.sequence_order)) ? Number(r.sequence_order) : Number.MAX_SAFE_INTEGER)
    return [...training].sort((a, b) => (pos(a) - pos(b))
      || (a.kind === b.kind ? 0 : (a.kind === 'quest' ? -1 : 1))
      || (a.title || '').localeCompare(b.title || ''))
  }, [training, orderOverride])

  const saveOrder = async (nextOrdered) => {
    const override = Object.fromEntries(nextOrdered.map((r, i) => [`${r.kind}:${r.id}`, i]))
    setOrderOverride(override)
    try {
      await api.put(withOrg('/api/sis/training/order', orgId),
        { items: nextOrdered.map((r) => ({ kind: r.kind, id: r.id })) })
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the order')
      setOrderOverride(null)
      reload?.()
    }
  }

  const move = (row, delta) => {
    const groupKey = row.category || 'General'
    const inGroup = ordered.filter((r) => (r.category || 'General') === groupKey)
    const at = inGroup.findIndex((r) => r.kind === row.kind && r.id === row.id)
    const to = at + delta
    if (at < 0 || to < 0 || to >= inGroup.length) return
    const swapped = [...inGroup]
    ;[swapped[at], swapped[to]] = [swapped[to], swapped[at]]
    // Rebuild the whole list with this group's rows in their new order, in
    // the slots the group already occupied, so other groups do not move.
    let k = 0
    const next = ordered.map((r) => ((r.category || 'General') === groupKey ? swapped[k++] : r))
    saveOrder(next)
  }

  return { ordered, move }
}
