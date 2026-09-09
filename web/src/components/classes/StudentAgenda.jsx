import React, { useState, useEffect } from 'react'
import { CalendarDaysIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import classService from '../../services/classService'

/**
 * StudentAgenda - upcoming class-quest due dates for the current student, grouped
 * by Overdue / This week / Next week / Later. Renders nothing when there are no
 * upcoming due dates (so it stays invisible for orgs that don't use due dates).
 */
export default function StudentAgenda({ basePath = null }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await classService.getStudentAgenda()
        if (active && res.success) setItems(res.agenda || [])
      } catch (e) {
        // Silent: agenda is supplementary, never block the page.
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  if (loading || items.length === 0) return null

  const now = Date.now()
  const DAY = 86400000
  const groups = { 'Overdue': [], 'This week': [], 'Next week': [], 'Later': [] }
  for (const it of items) {
    if (!it.due_date) continue
    const diff = new Date(it.due_date).getTime() - now
    if (diff < 0) groups['Overdue'].push(it)
    else if (diff <= 7 * DAY) groups['This week'].push(it)
    else if (diff <= 14 * DAY) groups['Next week'].push(it)
    else groups['Later'].push(it)
  }

  const openQuest = (it) => {
    if (basePath && it.class_id) {
      sessionStorage.setItem('classReturnPath', `${basePath}/${it.class_id}`)
    }
    navigate(`/quests/${it.quest_id}`)
  }

  return (
    <div className="mb-8 bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <CalendarDaysIcon className="w-5 h-5 text-optio-purple" />
        Upcoming
      </h2>
      <div className="space-y-4">
        {Object.entries(groups).map(([label, list]) =>
          list.length === 0 ? null : (
            <div key={label}>
              <h3
                className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
                  label === 'Overdue' ? 'text-red-600' : 'text-gray-500'
                }`}
              >
                {label}
              </h3>
              <div className="space-y-1.5">
                {list.map((it) => (
                  <button
                    key={`${it.class_id}-${it.quest_id}`}
                    onClick={() => openQuest(it)}
                    className="flex items-center gap-3 w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm text-gray-500 w-16 flex-shrink-0">
                      {new Date(it.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="font-medium text-gray-900 truncate flex-1">{it.title}</span>
                    <span className="text-xs text-gray-400 truncate flex-shrink-0 max-w-[40%]">{it.class_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
