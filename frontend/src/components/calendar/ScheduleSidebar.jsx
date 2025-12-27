import React, { useState } from 'react'
import { useUpdateDeadline, getPillarColor } from '../../hooks/api/useCalendar'
import { PlusIcon } from '@heroicons/react/24/outline'

const ScheduleSidebar = ({ userId, calendarData, selectedPillar }) => {
  const updateDeadline = useUpdateDeadline()

  // Get unscheduled items
  const unscheduledItems = (calendarData?.items || [])
    .filter(item => !item.scheduled_date && item.status !== 'completed')
    .filter(item => !selectedPillar || item.pillar === selectedPillar)

  const handleQuickSchedule = async (item, daysFromNow) => {
    // Use local date to avoid timezone issues
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + daysFromNow)

    // Format as YYYY-MM-DD using local timezone
    const year = targetDate.getFullYear()
    const month = String(targetDate.getMonth() + 1).padStart(2, '0')
    const day = String(targetDate.getDate()).padStart(2, '0')
    const scheduledDate = `${year}-${month}-${day}`

    try {
      await updateDeadline.mutateAsync({
        userId,
        questId: item.quest_id,
        taskId: item.id,
        scheduledDate
      })
    } catch (error) {
      console.error('Failed to schedule:', error)
    }
  }

  const handleCustomSchedule = async (item, customDate) => {
    if (!customDate) return

    try {
      await updateDeadline.mutateAsync({
        userId,
        questId: item.quest_id,
        taskId: item.id,
        scheduledDate: customDate
      })
    } catch (error) {
      console.error('Failed to schedule:', error)
    }
  }

  if (unscheduledItems.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>Unscheduled Items</h3>
        <p className="text-sm text-gray-600">
          All your items are scheduled! Start a new quest to add more.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 sticky top-20">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>Unscheduled Items</h3>
        <p className="text-sm text-gray-600 mt-1">Use quick schedule buttons or pick a date</p>
      </div>

      <div className="p-4 space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
        {unscheduledItems.map(item => (
          <UnscheduledItem
            key={item.id}
            item={item}
            onQuickSchedule={handleQuickSchedule}
            onCustomSchedule={handleCustomSchedule}
          />
        ))}
      </div>
    </div>
  )
}

const UnscheduledItem = ({ item, onQuickSchedule, onCustomSchedule }) => {
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const pillarColors = getPillarColor(item.pillar)

  const handleCustomSubmit = () => {
    onCustomSchedule(item, customDate)
    setShowDatePicker(false)
    setCustomDate('')
  }

  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
    >
      {/* Quest Image */}
      {item.quest_image && (
        <img
          src={item.quest_image}
          alt={`${item.quest_title} quest image`}
          className="w-full h-24 object-cover rounded mb-2"
        />
      )}

      {/* Task Info */}
      <div className="mb-2">
        {/* Task Title - Main (EMPHASIZED) */}
        <h4 className="font-bold text-gray-900 text-sm line-clamp-2 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>{item.task_title}</h4>
        {/* Quest Title - Subheading (secondary) */}
        <p className="text-xs text-gray-600 line-clamp-1 mb-1">{item.quest_title}</p>

        {/* Pillar and XP - Tertiary */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${pillarColors.bg} ${pillarColors.text}`}>
            {pillarColors.display}
          </span>
          {item.xp_value && (
            <span className="text-xs text-gray-600 font-medium">{item.xp_value} XP</span>
          )}
        </div>
      </div>

      {/* Quick Schedule Buttons */}
      {!showDatePicker ? (
        <div className="space-y-1">
          <button
            onClick={() => onQuickSchedule(item, 0)}
            className="w-full px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium hover:bg-blue-200 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => onQuickSchedule(item, 1)}
            className="w-full px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium hover:bg-purple-200 transition-colors"
          >
            Tomorrow
          </button>
          <button
            onClick={() => onQuickSchedule(item, 7)}
            className="w-full px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            Next Week
          </button>
          <button
            onClick={() => setShowDatePicker(true)}
            className="w-full px-2 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
          >
            <PlusIcon className="w-3 h-3" />
            Pick Date
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
            aria-label="Custom schedule date"
          />
          <div className="flex gap-1">
            <button
              onClick={handleCustomSubmit}
              disabled={!customDate}
              className="flex-1 px-2 py-1 bg-optio-purple text-white rounded text-xs font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Schedule
            </button>
            <button
              onClick={() => {
                setShowDatePicker(false)
                setCustomDate('')
              }}
              className="flex-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScheduleSidebar
