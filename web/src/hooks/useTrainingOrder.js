import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'

import api from '../services/api'
import { withOrg } from '../pages/sis/useSisOrg'
import { queryKeys } from '../utils/queryKeys'

/**
 * The creator's order of a school's training catalog, quests and links in
 * one list.
 *
 * Quests carry sequence_order and links sort_order, written on one shared
 * scale by PUT /api/sis/training/order, so sorting the merged list by that
 * number gives the arranged order whatever kind each row is (Molly, iCreate,
 * 2026-09-17, b26c05e3: "I entered them in numerical order but then
 * they..."). Ties (rows never arranged) fall back to quests first, then
 * title, which is what the page showed before there was an order to keep.
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
export default function useTrainingOrder({ training, links, orgId, reload }) {
  const queryClient = useQueryClient()
  const [orderOverride, setOrderOverride] = useState(null) // {`${kind}:${id}`: index} while a move saves
  useEffect(() => { setOrderOverride(null) }, [training])

  const ordered = useMemo(() => {
    const rows = [
      ...training.map((t) => ({ ...t, kind: 'quest', position: t.sequence_order })),
      ...links.map((l) => ({ ...l, kind: 'link', position: l.sort_order })),
    ]
    const pos = (r) => (orderOverride && orderOverride[`${r.kind}:${r.id}`] !== undefined)
      ? orderOverride[`${r.kind}:${r.id}`]
      : (Number.isFinite(Number(r.position)) ? Number(r.position) : Number.MAX_SAFE_INTEGER)
    return rows.sort((a, b) => (pos(a) - pos(b))
      || (a.kind === b.kind ? 0 : (a.kind === 'quest' ? -1 : 1))
      || (a.title || '').localeCompare(b.title || ''))
  }, [training, links, orderOverride])

  const saveOrder = async (nextOrdered) => {
    const override = Object.fromEntries(nextOrdered.map((r, i) => [`${r.kind}:${r.id}`, i]))
    setOrderOverride(override)
    try {
      await api.put(withOrg('/api/sis/training/order', orgId),
        { items: nextOrdered.map((r) => ({ kind: r.kind, id: r.id })) })
      queryClient.invalidateQueries({ queryKey: queryKeys.sis.trainingLinks(orgId) })
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
