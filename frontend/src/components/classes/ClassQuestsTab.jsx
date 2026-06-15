import React, { useState, useEffect } from 'react'
import {
  PlusIcon,
  TrashIcon,
  Bars3Icon,
  BookOpenIcon,
  ClockIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'
import { useOrgFeature } from '../../contexts/OrganizationContext'
import { useAuth } from '../../contexts/AuthContext'
import AddQuestModal from './AddQuestModal'

/**
 * Convert an ISO/UTC timestamp to the value a <input type="datetime-local"> expects
 * (local time, "YYYY-MM-DDTHH:mm"). Returns '' for empty input.
 */
const isoToLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * InlineDateEditor - shared datetime-local editor with Save / Clear / Cancel.
 */
function InlineDateEditor({ value, setValue, onSave, onClear, onCancel, hasValue }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
      />
      <button
        type="button"
        onClick={onSave}
        disabled={!value}
        className="px-3 py-1.5 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Save
      </button>
      {hasValue && (
        <button
          type="button"
          onClick={onClear}
          className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
      >
        Cancel
      </button>
    </div>
  )
}

/**
 * QuestRow - a single quest assigned to the class, with optional scheduling + due date.
 */
function QuestRow({ item, index, scheduledEnabled, dueDatesEnabled, onRemove, onSchedule, onSetDueDate }) {
  const quest = item.quests || {}
  const [editing, setEditing] = useState(null) // 'schedule' | 'due' | null
  const [scheduleValue, setScheduleValue] = useState(isoToLocalInput(item.publish_at))
  const [dueValue, setDueValue] = useState(isoToLocalInput(item.due_date))

  useEffect(() => {
    setScheduleValue(isoToLocalInput(item.publish_at))
    setDueValue(isoToLocalInput(item.due_date))
  }, [item.publish_at, item.due_date])

  const scheduledIso = item.publish_at || null
  const isFuture = scheduledIso && new Date(scheduledIso).getTime() > Date.now()
  const dueIso = item.due_date || null

  const saveSchedule = async () => {
    if (!scheduleValue) return
    await onSchedule(item.quest_id, new Date(scheduleValue).toISOString())
    setEditing(null)
  }
  const clearSchedule = async () => {
    await onSchedule(item.quest_id, null)
    setScheduleValue('')
    setEditing(null)
  }
  const saveDue = async () => {
    if (!dueValue) return
    await onSetDueDate(item.quest_id, new Date(dueValue).toISOString())
    setEditing(null)
  }
  const clearDue = async () => {
    await onSetDueDate(item.quest_id, null)
    setDueValue('')
    setEditing(null)
  }

  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="text-gray-300 cursor-move">
        <Bars3Icon className="w-5 h-5" />
      </div>

      <div className="w-8 h-8 rounded-full bg-optio-purple/10 text-optio-purple flex items-center justify-center text-sm font-medium">
        {index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-gray-900 truncate">{quest.title}</h4>
        {quest.description && (
          <p className="text-sm text-gray-500 line-clamp-1">{quest.description}</p>
        )}

        {editing === 'schedule' && (
          <InlineDateEditor
            value={scheduleValue}
            setValue={setScheduleValue}
            onSave={saveSchedule}
            onClear={clearSchedule}
            onCancel={() => { setScheduleValue(isoToLocalInput(item.publish_at)); setEditing(null) }}
            hasValue={!!scheduledIso}
          />
        )}
        {editing === 'due' && (
          <InlineDateEditor
            value={dueValue}
            setValue={setDueValue}
            onSave={saveDue}
            onClear={clearDue}
            onCancel={() => { setDueValue(isoToLocalInput(item.due_date)); setEditing(null) }}
            hasValue={!!dueIso}
          />
        )}
      </div>

      {/* Badges */}
      {scheduledEnabled && isFuture && !editing && (
        <span className="px-2 py-0.5 text-xs font-medium bg-optio-purple/10 text-optio-purple rounded whitespace-nowrap">
          Publishes {new Date(scheduledIso).toLocaleDateString()}
        </span>
      )}
      {dueDatesEnabled && dueIso && !editing && (
        <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded whitespace-nowrap">
          Due {new Date(dueIso).toLocaleDateString()}
        </span>
      )}

      {!quest.is_active && (
        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
          Inactive
        </span>
      )}

      {/* Due-date button */}
      {dueDatesEnabled && !editing && (
        <button
          onClick={() => setEditing('due')}
          className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
          title={dueIso ? 'Edit due date' : 'Set due date'}
        >
          <CalendarDaysIcon className="w-5 h-5" />
        </button>
      )}

      {/* Schedule button */}
      {scheduledEnabled && !editing && (
        <button
          onClick={() => setEditing('schedule')}
          className="p-2 text-gray-400 hover:text-optio-purple hover:bg-optio-purple/5 rounded-lg transition-colors"
          title={isFuture ? 'Edit publish schedule' : 'Schedule publish'}
        >
          <ClockIcon className="w-5 h-5" />
        </button>
      )}

      {/* Remove */}
      <button
        onClick={() => onRemove(item.quest_id)}
        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
        title="Remove quest from class"
      >
        <TrashIcon className="w-5 h-5" />
      </button>
    </div>
  )
}

/**
 * ClassQuestsTab - Manage quests assigned to a class
 */
export default function ClassQuestsTab({ orgId, classId, classData, onUpdate }) {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  const { isSuperadmin } = useAuth()
  // Per-org capabilities; superadmin (no org) can use them on any class.
  const scheduledEnabled = useOrgFeature('scheduled_publish') || isSuperadmin
  const dueDatesEnabled = useOrgFeature('due_dates') || isSuperadmin

  useEffect(() => {
    fetchQuests()
  }, [orgId, classId])

  const fetchQuests = async () => {
    try {
      setLoading(true)
      const response = await classService.getClassQuests(orgId, classId)
      if (response.success) {
        setQuests(response.quests || [])
      } else {
        toast.error(response.error || 'Failed to load quests')
      }
    } catch (error) {
      console.error('Failed to fetch quests:', error)
      toast.error('Failed to load quests')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveQuest = async (questId) => {
    if (
      !confirm(
        'Are you sure you want to remove this quest from the class? XP already earned will still count.'
      )
    ) {
      return
    }

    try {
      const response = await classService.removeClassQuest(orgId, classId, questId)
      if (response.success) {
        toast.success('Quest removed from class')
        fetchQuests()
        onUpdate?.()
      } else {
        toast.error(response.error || 'Failed to remove quest')
      }
    } catch (error) {
      console.error('Failed to remove quest:', error)
      toast.error(error.response?.data?.error || 'Failed to remove quest')
    }
  }

  const handleScheduleQuest = async (questId, publishAt) => {
    try {
      const response = await classService.setClassQuestSchedule(orgId, classId, questId, publishAt)
      if (response.success) {
        toast.success(publishAt ? 'Publish scheduled' : 'Schedule cleared')
        fetchQuests()
        onUpdate?.()
      } else {
        toast.error(response.error || 'Failed to schedule quest')
      }
    } catch (error) {
      console.error('Failed to schedule quest:', error)
      toast.error(error.response?.data?.error || 'Failed to schedule quest')
    }
  }

  const handleSetDueDate = async (questId, dueDate) => {
    try {
      const response = await classService.setClassQuestDueDate(orgId, classId, questId, dueDate)
      if (response.success) {
        toast.success(dueDate ? 'Due date set' : 'Due date cleared')
        fetchQuests()
        onUpdate?.()
      } else {
        toast.error(response.error || 'Failed to set due date')
      }
    } catch (error) {
      console.error('Failed to set due date:', error)
      toast.error(error.response?.data?.error || 'Failed to set due date')
    }
  }

  const handleAddQuest = async (questId, wasCreated = false) => {
    if (wasCreated) {
      fetchQuests()
      onUpdate?.()
      return
    }

    try {
      const response = await classService.addClassQuest(orgId, classId, questId)
      if (response.success) {
        toast.success('Quest added to class')
        setShowAddModal(false)
        fetchQuests()
        onUpdate?.()
      } else {
        toast.error(response.error || 'Failed to add quest')
      }
    } catch (error) {
      console.error('Failed to add quest:', error)
      toast.error(error.response?.data?.error || 'Failed to add quest')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        <span className="ml-3 text-gray-500">Loading quests...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-gray-600">
          Students earn XP by completing tasks from these quests
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          <PlusIcon className="w-5 h-5" />
          Add Quest
        </button>
      </div>

      {quests.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <BookOpenIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No quests assigned to this class yet</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-optio-purple text-white rounded-lg hover:bg-optio-purple/90 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Add First Quest
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {quests.map((item, index) => (
            <QuestRow
              key={item.id}
              item={item}
              index={index}
              scheduledEnabled={scheduledEnabled}
              dueDatesEnabled={dueDatesEnabled}
              onRemove={handleRemoveQuest}
              onSchedule={handleScheduleQuest}
              onSetDueDate={handleSetDueDate}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddQuestModal
          orgId={orgId}
          classId={classId}
          existingQuestIds={quests.map((q) => q.quest_id)}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddQuest}
        />
      )}
    </div>
  )
}
