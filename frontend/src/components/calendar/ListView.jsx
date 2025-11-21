import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUpdateDeadline, useBulkUpdateDeadlines, getPillarColor, useTaskStatus } from '../../hooks/api/useCalendar'
import { CalendarIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

const ListView = ({ data, userId, selectedPillar }) => {
  const [selectedItems, setSelectedItems] = useState([])
  const [bulkScheduleDate, setBulkScheduleDate] = useState('')
  const updateDeadline = useUpdateDeadline()
  const bulkUpdateDeadlines = useBulkUpdateDeadlines()

  // Filter items
  const filteredItems = (data?.items || [])
    .filter(item => !selectedPillar || item.pillar === selectedPillar)

  // Group items by status
  const today = new Date().toISOString().split('T')[0]
  const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const todayItems = filteredItems.filter(
    item => item.scheduled_date === today && item.status !== 'completed'
  )
  const thisWeekItems = filteredItems.filter(
    item => item.scheduled_date && item.scheduled_date > today && item.scheduled_date <= weekEnd && item.status !== 'completed'
  )
  const laterItems = filteredItems.filter(
    item => item.scheduled_date && item.scheduled_date > weekEnd && item.status !== 'completed'
  )
  const wanderingItems = filteredItems.filter(
    item => item.status === 'wandering'
  )
  const completedItems = filteredItems.filter(
    item => item.status === 'completed'
  )
  const unscheduledItems = filteredItems.filter(
    item => !item.scheduled_date && item.status !== 'completed' && item.status !== 'wandering'
  )

  // Handle individual reschedule
  const handleReschedule = async (item, newDate) => {
    try {
      await updateDeadline.mutateAsync({
        userId,
        questId: item.quest_id,
        taskId: item.id,
        scheduledDate: newDate || null
      })
    } catch (error) {
      console.error('Failed to reschedule:', error)
    }
  }

  // Handle bulk reschedule
  const handleBulkReschedule = async () => {
    if (!bulkScheduleDate || selectedItems.length === 0) return

    try {
      const updates = selectedItems.map(itemId => {
        const item = filteredItems.find(i => i.id === itemId)
        return {
          quest_id: item.quest_id,
          task_id: item.id,
          scheduled_date: bulkScheduleDate
        }
      })

      await bulkUpdateDeadlines.mutateAsync({
        userId,
        items: updates
      })

      // Clear selections
      setSelectedItems([])
      setBulkScheduleDate('')
    } catch (error) {
      console.error('Failed to bulk reschedule:', error)
    }
  }

  // Toggle item selection
  const toggleSelection = (itemId) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    )
  }

  // Select all
  const selectAll = () => {
    const allIds = [...todayItems, ...thisWeekItems, ...laterItems, ...wanderingItems, ...unscheduledItems]
      .map(item => item.id)
    setSelectedItems(allIds)
  }

  // Clear selections
  const clearSelections = () => {
    setSelectedItems([])
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200" id="list-panel" role="tabpanel">
      {/* Bulk Actions Toolbar */}
      {selectedItems.length > 0 && (
        <div className="p-4 bg-purple-50 border-b border-purple-200 flex items-center justify-between">
          <span className="text-sm font-medium text-purple-900">
            {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={bulkScheduleDate}
              onChange={(e) => setBulkScheduleDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              aria-label="Bulk schedule date"
            />
            <button
              onClick={handleBulkReschedule}
              disabled={!bulkScheduleDate}
              className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Schedule Selected
            </button>
            <button
              onClick={clearSelections}
              className="px-3 py-1.5 text-gray-700 hover:text-gray-900 text-sm font-medium"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Select All */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={selectAll}
          className="text-sm text-purple-600 hover:text-purple-800 font-medium"
        >
          Select All
        </button>
      </div>

      <div className="divide-y divide-gray-200">
        {/* Today */}
        {todayItems.length > 0 && (
          <Section
            title="Today"
            items={todayItems}
            selectedItems={selectedItems}
            toggleSelection={toggleSelection}
            handleReschedule={handleReschedule}
            userId={userId}
          />
        )}

        {/* This Week */}
        {thisWeekItems.length > 0 && (
          <Section
            title="This Week"
            items={thisWeekItems}
            selectedItems={selectedItems}
            toggleSelection={toggleSelection}
            handleReschedule={handleReschedule}
            userId={userId}
          />
        )}

        {/* Later */}
        {laterItems.length > 0 && (
          <Section
            title="Later"
            items={laterItems}
            selectedItems={selectedItems}
            toggleSelection={toggleSelection}
            handleReschedule={handleReschedule}
            userId={userId}
          />
        )}

        {/* Wandering */}
        {wanderingItems.length > 0 && (
          <Section
            title="Ready for a Pivot"
            subtitle="Past their date or inactive recently"
            items={wanderingItems}
            selectedItems={selectedItems}
            toggleSelection={toggleSelection}
            handleReschedule={handleReschedule}
            userId={userId}
          />
        )}

        {/* Unscheduled */}
        {unscheduledItems.length > 0 && (
          <Section
            title="Unscheduled"
            subtitle="Add a date when you're ready"
            items={unscheduledItems}
            selectedItems={selectedItems}
            toggleSelection={toggleSelection}
            handleReschedule={handleReschedule}
            userId={userId}
          />
        )}

        {/* Completed */}
        {completedItems.length > 0 && (
          <Section
            title="Completed"
            items={completedItems}
            selectedItems={selectedItems}
            toggleSelection={toggleSelection}
            handleReschedule={handleReschedule}
            userId={userId}
            showCompleted
          />
        )}
      </div>

      {/* Empty State */}
      {filteredItems.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-gray-600">No items{selectedPillar ? ' for this pillar' : ''}. Start a quest to get going!</p>
        </div>
      )}
    </div>
  )
}

const Section = ({ title, subtitle, items, selectedItems, toggleSelection, handleReschedule, userId, showCompleted }) => {
  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>{title}</h3>
      {subtitle && <p className="text-sm text-gray-600 mb-3">{subtitle}</p>}
      <div className="space-y-2">
        {items.map(item => (
          <TaskRow
            key={item.id}
            item={item}
            isSelected={selectedItems.includes(item.id)}
            onToggle={() => toggleSelection(item.id)}
            onReschedule={handleReschedule}
            showCompleted={showCompleted}
          />
        ))}
      </div>
    </div>
  )
}

const TaskRow = ({ item, isSelected, onToggle, onReschedule, showCompleted }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [newDate, setNewDate] = useState(item.scheduled_date || '')
  const pillarColors = getPillarColor(item.pillar)
  const taskStatus = useTaskStatus(item)

  const handleSaveDate = () => {
    onReschedule(item, newDate)
    setIsEditing(false)
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
      isSelected ? 'bg-purple-50 border-purple-300' : 'bg-gray-50 border-gray-200'
    }`}>
      {/* Checkbox */}
      {!showCompleted && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
          aria-label={`Select ${item.task_title}`}
        />
      )}

      {/* Quest Image */}
      {item.quest_image && (
        <img
          src={item.quest_image}
          alt=""
          className="w-12 h-12 rounded object-cover flex-shrink-0"
        />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Task Title - Main (EMPHASIZED) */}
        <Link to={`/quests/${item.quest_id}`} className="font-bold text-gray-900 hover:text-purple-600 truncate block text-base mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {item.task_title}
        </Link>
        {/* Quest Title - Subheading (secondary) */}
        <p className="text-sm text-gray-600 truncate mb-1">{item.quest_title}</p>

        {/* Pillar, XP, Status - Tertiary */}
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${pillarColors.bg} ${pillarColors.text}`}>
            {pillarColors.display}
          </span>
          {item.xp_value && (
            <span className="text-xs font-medium text-gray-600">{item.xp_value} XP</span>
          )}
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${taskStatus.bgColor} ${taskStatus.textColor}`}>
            {taskStatus.label}
          </span>
        </div>
      </div>

      {/* Date */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {showCompleted ? (
          <div className="flex items-center gap-1 text-sm text-green-700">
            <CheckCircleIcon className="w-4 h-4" />
            {new Date(item.completed_at).toLocaleDateString()}
          </div>
        ) : isEditing ? (
          <>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="px-2 py-1 border border-gray-300 rounded text-sm"
              aria-label="New schedule date"
            />
            <button
              onClick={handleSaveDate}
              className="px-2 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
            >
              Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-2 py-1 text-gray-600 hover:text-gray-800 text-sm"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 px-2 py-1 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded"
          >
            <CalendarIcon className="w-4 h-4" />
            {item.scheduled_date ? new Date(item.scheduled_date).toLocaleDateString() : 'Schedule'}
          </button>
        )}
      </div>
    </div>
  )
}

export default ListView
