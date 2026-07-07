import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../../services/api'

/**
 * Quest Groups — named subcategories of the org's quests (e.g. "Ages 5-7 pins",
 * "STEM pins") used for batch assignment. Create groups here and put quests in
 * them; assignment UIs (e.g. the Treehouse Assign tab) can then select a whole
 * group at once. A quest can be in several groups.
 */
export default function QuestGroupsManager({ orgId, refreshKey = 0 }) {
  const [groups, setGroups] = useState([])
  const [quests, setQuests] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [membership, setMembership] = useState({})
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const [groupsRes, questsRes] = await Promise.all([
        api.get(`/api/organizations/${orgId}/quest-groups`),
        api.get(`/api/admin/organizations/${orgId}/quests`),
      ])
      setGroups(groupsRes.data.groups || [])
      setQuests(questsRes.data.quests || [])
    } catch {
      toast.error('Could not load quest groups')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [orgId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const selected = groups.find(g => g.id === selectedId) || null

  const openGroup = (group) => {
    setSelectedId(group.id)
    setMembership(Object.fromEntries((group.quest_ids || []).map(id => [id, true])))
  }

  const createGroup = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      const { data } = await api.post(`/api/organizations/${orgId}/quest-groups`, { name })
      setGroups(gs => [...gs, data.group].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
      openGroup(data.group)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not create group')
    } finally {
      setBusy(false)
    }
  }

  const saveMembership = async () => {
    if (!selected) return
    const quest_ids = Object.keys(membership).filter(id => membership[id])
    setBusy(true)
    try {
      await api.put(`/api/organizations/${orgId}/quest-groups/${selected.id}/quests`, { quest_ids })
      setGroups(gs => gs.map(g => (g.id === selected.id ? { ...g, quest_ids } : g)))
      toast.success(`Saved "${selected.name}" (${quest_ids.length} quests)`)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save group')
    } finally {
      setBusy(false)
    }
  }

  const deleteGroup = async () => {
    if (!selected) return
    if (!window.confirm(`Delete the group "${selected.name}"? The quests themselves are not affected.`)) return
    setBusy(true)
    try {
      await api.delete(`/api/organizations/${orgId}/quest-groups/${selected.id}`)
      setGroups(gs => gs.filter(g => g.id !== selected.id))
      setSelectedId(null)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not delete group')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-900">Quest Groups</h3>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">
        Group quests into sets (like "Ages 5-7 pins" or "STEM pins") so you can assign a whole set to students or cohorts at once.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {groups.map(g => (
          <button
            key={g.id}
            onClick={() => (selectedId === g.id ? setSelectedId(null) : openGroup(g))}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              selectedId === g.id
                ? 'bg-optio-purple text-white border-optio-purple'
                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
            }`}
          >
            {g.name} ({(g.quest_ids || []).length})
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createGroup()}
            placeholder="New group name"
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-full w-40"
          />
          <button
            onClick={createGroup}
            disabled={busy || !newName.trim()}
            className="px-3 py-1.5 text-sm font-medium text-optio-purple border border-optio-purple/40 rounded-full hover:bg-optio-purple/5 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {selected && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-2">Quests in "{selected.name}"</p>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
            {quests.map(q => (
              <label key={q.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={!!membership[q.id]}
                  onChange={() => setMembership(m => ({ ...m, [q.id]: !m[q.id] }))}
                  className="w-4 h-4 accent-purple-600"
                />
                <span className="text-sm text-gray-900">{q.title}</span>
              </label>
            ))}
            {quests.length === 0 && <p className="text-sm text-gray-400 p-3">No organization quests yet.</p>}
          </div>
          <div className="flex gap-2 justify-end mt-3">
            <button
              onClick={deleteGroup}
              disabled={busy}
              className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
            >
              Delete group
            </button>
            <button
              onClick={saveMembership}
              disabled={busy}
              className="px-4 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save group'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
