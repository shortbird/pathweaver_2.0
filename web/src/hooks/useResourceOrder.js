import { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'

import api from '../services/api'
import { withOrg } from '../pages/sis/useSisOrg'

/**
 * The admin's order of a school's document library (SIS Library > Documents).
 *
 * The server sends the library already sorted by sort_order, then title, so
 * `resources` arrives in the order to show. iCreate 07b646fa: "It'd be nice
 * if I could rearrange the resources to put them in a certain order (like
 * move them up or down.)" and 48531900: "I just realized the docs are
 * alphabetical!" -- every row was sort_order 0, so the title decided.
 *
 * `move(row, delta)` swaps a row with its neighbour inside its category and
 * saves the WHOLE list through PUT /api/sis/resources/order, which writes
 * each row's index. Sending every row, not just the two that swapped, is what
 * stops a never-arranged library (all 0) from tying after the first move.
 *
 * Optimistic, like useTrainingOrder: the row moves at once through an
 * override that is dropped when the page reloads (`resources` changes).
 * The override remembers the list it was made from and is ignored once
 * `resources` is a different array. It used to be cleared by an effect on
 * `resources`, and that effect could flush AFTER the admin's first click
 * (React defers passive effects), wiping the move just made: the release
 * of 2026-10-05 failed on exactly that in CI.
 *
 * Returns { ordered, move }.
 */
export default function useResourceOrder({ resources, orgId, reload }) {
  // { base: the resources array it was made from, ids: [id, ...] }
  const [override, setOverride] = useState(null)
  const orderOverride = override && override.base === resources ? override.ids : null

  const ordered = useMemo(() => {
    if (!orderOverride) return resources
    const byId = new Map(resources.map((r) => [r.id, r]))
    const known = orderOverride.map((id) => byId.get(id)).filter(Boolean)
    const rest = resources.filter((r) => !orderOverride.includes(r.id))
    return [...known, ...rest]
  }, [resources, orderOverride])

  const saveOrder = async (next) => {
    const ids = next.map((r) => r.id)
    setOverride({ base: resources, ids })
    try {
      await api.put(withOrg('/api/sis/resources/order', orgId), { ids })
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not save the order')
      setOverride(null)
      reload?.()
    }
  }

  const move = (row, delta) => {
    const groupKey = row.category || 'General'
    const inGroup = ordered.filter((r) => (r.category || 'General') === groupKey)
    const at = inGroup.findIndex((r) => r.id === row.id)
    const to = at + delta
    if (at < 0 || to < 0 || to >= inGroup.length) return
    const swapped = [...inGroup]
    ;[swapped[at], swapped[to]] = [swapped[to], swapped[at]]
    // This group's rows in their new order, in the slots the group already
    // held, so the other categories keep their places.
    let k = 0
    const next = ordered.map((r) => ((r.category || 'General') === groupKey ? swapped[k++] : r))
    saveOrder(next)
  }

  return { ordered, move }
}
