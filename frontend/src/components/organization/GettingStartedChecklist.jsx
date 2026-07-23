import React, { useEffect, useState } from 'react'
import { CheckCircleIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid'
import api from '../../services/api'

const STEPS = [
  {
    key: 'teachers',
    title: 'Add your teachers',
    subtitle: 'Invite teachers by email so they can run classes.',
    tab: 'people',
    isDone: (counts) => counts.teachers > 0
  },
  {
    key: 'students',
    title: 'Add your students',
    subtitle: 'Paste a class list to create username accounts, or import a CSV.',
    tab: 'people',
    isDone: (counts) => counts.students > 0
  },
  {
    key: 'parents',
    title: 'Invite parents',
    subtitle: 'One invite connects a parent to their kids automatically.',
    tab: 'people',
    isDone: (counts) => counts.parents > 0 || counts.parent_links > 0
  },
  {
    key: 'classes',
    title: 'Create your first class',
    subtitle: 'Group students into a class and assign a teacher.',
    tab: 'classes',
    isDone: (counts) => counts.classes > 0
  },
  {
    key: 'class_quests',
    title: 'Assign a quest',
    subtitle: 'Add a quest to a class so students have something to work on.',
    tab: 'classes',
    isDone: (counts) => counts.class_quests > 0
  }
]

/**
 * GettingStartedChecklist - Guides a new school admin through initial setup.
 *
 * Status is derived from live org data (member counts, classes, class quests),
 * so it survives page reloads and multiple admins. Hidden once every step is
 * done or the admin dismisses it.
 */
export default function GettingStartedChecklist({ orgId, onNavigate }) {
  const dismissKey = `orgSetupChecklistDismissed_${orgId}`
  const [counts, setCounts] = useState(null)
  // localStorage can be unavailable (Safari private mode, restricted envs)
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey) === 'true' } catch { return false }
  })

  useEffect(() => {
    if (dismissed || !orgId) return
    let cancelled = false
    api.get(`/api/admin/organizations/${orgId}/setup-status`)
      .then(response => {
        if (!cancelled && response.data?.success) {
          setCounts(response.data.counts)
        }
      })
      .catch(() => { /* checklist is best-effort; hide on failure */ })
    return () => { cancelled = true }
  }, [orgId, dismissed])

  if (dismissed || !counts) return null

  const doneCount = STEPS.filter(step => step.isDone(counts)).length
  if (doneCount === STEPS.length) return null

  const handleDismiss = () => {
    try { localStorage.setItem(dismissKey, 'true') } catch { /* ignore */ }
    setDismissed(true)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Getting Started</h2>
          <p className="text-sm text-gray-500">
            {doneCount} of {STEPS.length} steps done — finish setting up your school.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          title="Hide checklist"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-optio-purple to-optio-pink rounded-full transition-all"
          style={{ width: `${(doneCount / STEPS.length) * 100}%` }}
        />
      </div>

      <div className="space-y-1">
        {STEPS.map(step => {
          const done = step.isDone(counts)
          return (
            <button
              key={step.key}
              onClick={() => !done && onNavigate(step.tab)}
              disabled={done}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                done ? 'opacity-60' : 'hover:bg-gray-50'
              }`}
            >
              {done ? (
                <CheckCircleSolidIcon className="w-6 h-6 text-green-500 flex-shrink-0" />
              ) : (
                <CheckCircleIcon className="w-6 h-6 text-gray-300 flex-shrink-0" />
              )}
              <span className="flex-1 min-w-0">
                <span className={`block text-sm font-medium ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                  {step.title}
                </span>
                {!done && (
                  <span className="block text-xs text-gray-500">{step.subtitle}</span>
                )}
              </span>
              {!done && <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
