import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import Button from '../../../components/ui/Button'
import { INPUT_CLASS as field } from '../../../components/ui/Input'
import { sisFamilyApi } from '../../../hooks/api/useSisFamilyDetail'

// The school's own named groups of families (services/sis_family_groups.py).
// The first is "OpenEd" at Optio Academy: the families who came from
// Hearthwood. A group is only a label: who pays is the funding source, set
// separately on the Registration tab.
const FamilyGroupsRow = ({ household, orgId, onSaved }) => {
  const [groups, setGroups] = useState(null)
  const [chosen, setChosen] = useState((household.groups || []).map((g) => g.id))
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    sisFamilyApi.listGroups(orgId)
      .then((r) => { if (!cancelled) setGroups(r.data.groups || []) })
      .catch(() => { if (!cancelled) setGroups([]) })
    return () => { cancelled = true }
  }, [orgId])

  const save = async (next) => {
    setBusy(true)
    try {
      await sisFamilyApi.setGroups(household.id, next, orgId)
      setChosen(next)
      onSaved?.()
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not save the groups') }
    finally { setBusy(false) }
  }

  const toggle = (id) => save(chosen.includes(id) ? chosen.filter((g) => g !== id) : [...chosen, id])

  const create = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      const r = await sisFamilyApi.createGroup(name, orgId)
      const group = r.data.group
      setGroups((gs) => [...(gs || []), group].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
      setBusy(false)
      await save([...chosen, group.id])
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not make the group')
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="text-xs text-neutral-500">Family groups</div>
      {groups === null ? (
        <p className="mt-1 text-xs text-neutral-400">Loading…</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {groups.length === 0 && <span className="text-xs text-neutral-400">No groups yet.</span>}
          {groups.map((g) => (
            <label key={g.id} className="inline-flex items-center gap-2 text-sm text-neutral-800">
              <input type="checkbox" checked={chosen.includes(g.id)} disabled={busy} onChange={() => toggle(g.id)}
                className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple" />
              {g.name}
            </label>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') create() }}
          placeholder="New group, e.g. OpenEd" aria-label="New group name" className={`${field} mt-0`} />
        <Button size="sm" variant="outline" onClick={create} disabled={busy || !newName.trim()}>Add</Button>
      </div>
    </div>
  )
}

export default FamilyGroupsRow
