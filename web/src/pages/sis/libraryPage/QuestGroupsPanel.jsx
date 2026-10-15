import React, { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { RectangleStackIcon } from '@heroicons/react/24/outline'
import { useSisOrg } from '../useSisOrg'
import { useSisQuestLibrary } from '../../../hooks/api/useSisQuestLibrary'
import { useQuestGroupMutations, useQuestGroups } from '../../../hooks/api/useSisOptioQuests'
import { useConfirm } from '../../../contexts/ConfirmContext'
import { Input } from '../../../components/ui/Input'
import EmptyState from '../../../components/ui/EmptyState'
import Button from '../../../components/ui/Button'

/**
 * QuestGroupsPanel -- named sets of the school's quests ("Ages 5-7 pins",
 * "STEM pins") so a whole set can be assigned at once. A quest can be in
 * several groups.
 *
 * Built for the Treehouse Learning Center, whose facilitator Assign tab reads
 * the groups (programs/treehouse/TreehouseFacilitatorPage.jsx). It lived in
 * the web org console (components/organization/QuestGroupsManager.jsx) and
 * moved here on 2026-10-15 with the rest of the console.
 *
 * Offered only to a school with feature_flags.quest_groups_enabled
 * (questGroupsOn). The console also opened it for the slug 'treehouse'; that
 * slug check is gone, so Treehouse needs the flag set on its org row.
 *
 * The endpoints are the console's own (/api/organizations/<id>/quest-groups*),
 * which now admit a campus coordinator as well, like every front-office tab.
 * The quests to choose from are the school's library (GET /api/sis/quests),
 * the list beside this one.
 */

export const questGroupsOn = (org) => Boolean(org?.feature_flags?.quest_groups_enabled)

export default function QuestGroupsPanel() {
  const { orgId } = useSisOrg()
  const confirm = useConfirm()
  const { data: groups = [], isLoading, isError } = useQuestGroups(orgId)
  const { data: library } = useSisQuestLibrary(orgId)
  const quests = useMemo(() => library?.quests || [], [library])
  const { create, rename, remove, setQuests } = useQuestGroupMutations(orgId)

  const [newName, setNewName] = useState('')
  const [openId, setOpenId] = useState(null)
  const [members, setMembers] = useState(() => new Set())
  const [filter, setFilter] = useState('')
  const [nameDraft, setNameDraft] = useState('')

  const open = groups.find((g) => g.id === openId) || null

  const openGroup = (g) => {
    setOpenId(g.id)
    setMembers(new Set(g.quest_ids || []))
    setNameDraft(g.name)
    setFilter('')
  }

  const createGroup = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      const group = await create.mutateAsync(name)
      setNewName('')
      if (group) openGroup(group)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not make that group')
    }
  }

  const save = async () => {
    if (!open) return
    try {
      const name = nameDraft.trim()
      if (name && name !== open.name) await rename.mutateAsync({ groupId: open.id, name })
      const out = await setQuests.mutateAsync({ groupId: open.id, questIds: [...members] })
      const n = out?.quest_ids?.length ?? members.size
      toast.success(`Saved “${name || open.name}” (${n} ${n === 1 ? 'quest' : 'quests'})`)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not save the group')
    }
  }

  const deleteGroup = async () => {
    if (!open) return
    if (!(await confirm({
      title: `Delete the group “${open.name}”?`,
      body: 'Only the group goes. Its quests stay in your library and with the students who have them.',
      confirmLabel: 'Delete group',
      cancelLabel: 'Keep it',
    }))) return
    try {
      await remove.mutateAsync(open.id)
      setOpenId(null)
      toast.success(`Deleted “${open.name}”`)
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not delete the group')
    }
  }

  const toggle = (id) => setMembers((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return f ? quests.filter((q) => (q.title || '').toLowerCase().includes(f)) : quests
  }, [quests, filter])

  const busy = create.isPending || rename.isPending || remove.isPending || setQuests.isPending

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">
        Put quests into sets, like “Ages 5-7 pins” or “STEM pins”, so a whole set can be assigned at once.
        A quest can be in more than one group.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {groups.map((g) => (
          <button key={g.id} type="button" aria-pressed={openId === g.id}
            onClick={() => (openId === g.id ? setOpenId(null) : openGroup(g))}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              openId === g.id
                ? 'bg-optio-purple text-white border-optio-purple'
                : 'bg-white text-neutral-700 border-gray-200 hover:border-optio-purple/60'}`}>
            {g.name} ({(g.quest_ids || []).length})
          </button>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-48">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createGroup()}
              placeholder="New group name" aria-label="New group name" />
          </div>
          <Button size="xs" variant="secondary" onClick={createGroup} disabled={busy || !newName.trim()}>
            Add group
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-neutral-500 text-sm">Loading…</p>}
      {isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4" role="alert">
          Could not load the quest groups.
        </div>
      )}
      {!isLoading && !isError && groups.length === 0 && (
        <EmptyState icon={RectangleStackIcon} title="No quest groups yet"
          hint="Name a group above, then choose its quests." />
      )}

      {open && (
        <section className="bg-white rounded-xl border border-gray-200 p-4" aria-label={`Quests in ${open.name}`}>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <label className="block flex-1 min-w-[12rem]">
              <span className="block text-sm font-medium text-gray-700 mb-1">Group name</span>
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} aria-label="Group name" />
            </label>
            <div className="flex-1 min-w-[12rem]">
              <Input value={filter} onChange={(e) => setFilter(e.target.value)}
                placeholder="Find a quest…" aria-label="Find a quest" />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-100">
            {shown.map((q) => (
              <label key={q.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-neutral-50">
                <input type="checkbox" checked={members.has(q.id)} onChange={() => toggle(q.id)}
                  className="w-4 h-4 accent-optio-purple" />
                <span className="text-sm text-neutral-900">{q.title}</span>
              </label>
            ))}
            {quests.length === 0 && <p className="text-sm text-neutral-400 p-3">Your school has no quests yet.</p>}
            {quests.length > 0 && shown.length === 0 && <p className="text-sm text-neutral-400 p-3">No quest matches.</p>}
          </div>
          <div className="flex justify-between items-center mt-3">
            <span className="text-xs text-neutral-500">{members.size} chosen</span>
            <div className="flex gap-2">
              <Button size="xs" variant="danger" onClick={deleteGroup} disabled={busy}>Delete group</Button>
              <Button size="xs" onClick={save} disabled={busy}>{setQuests.isPending ? 'Saving…' : 'Save group'}</Button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
