import React, { useEffect, useState } from 'react'
import { CheckCircleIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid'
import api from '../../services/api'

import { moduleKnownOff } from '../../modules/moduleEnabled'

// `tab` is the organization console's tab (its onNavigate takes the tab);
// `to` is the SIS console page the same step opens (the SIS dashboard's
// onNavigate takes it as the second argument). Every org is an SIS org since
// 2026-10-15 and the organization console is on its way out, so the words
// describe the SIS pages. `module`: the step hides when the school has that
// building block off -- a school with no classes has no class to create.
const STEPS = [
  {
    key: 'teachers',
    title: 'Add your teachers',
    subtitle: 'Add each teacher as a staff member so they can run classes.',
    tab: 'people',
    to: () => '/people?add=staff',
    isDone: (counts) => counts.teachers > 0
  },
  {
    key: 'students',
    title: 'Add your students',
    subtitle: 'Paste or upload a spreadsheet of students and parents.',
    tab: 'people',
    to: () => '/people?add=roster',
    isDone: (counts) => counts.students > 0
  },
  {
    key: 'parents',
    title: 'Invite parents',
    subtitle: 'Add a family: parents and their children together.',
    tab: 'people',
    to: () => '/people?add=family',
    isDone: (counts) => counts.parents > 0 || counts.parent_links > 0
  },
  {
    key: 'classes',
    title: 'Create your first class',
    subtitle: 'Group students into a class and assign a teacher.',
    tab: 'classes',
    module: 'classes',
    to: () => '/classes?tab=all',
    isDone: (counts) => counts.classes > 0
  },
  {
    key: 'class_quests',
    title: 'Assign a quest',
    subtitle: 'Build a quest in the Library, then add it to a class so students have something to work on.',
    tab: 'classes',
    module: 'classes',
    // The Library's Quests tab follows the curriculum block; without it, the
    // class page is where a quest is added.
    to: (org) => (moduleKnownOff(org, 'curriculum') ? '/classes?tab=all' : '/library?tab=quests'),
    isDone: (counts) => counts.class_quests > 0
  }
]

/**
 * GettingStartedChecklist - Guides a new school admin through initial setup.
 *
 * Status is derived from live org data (member counts, classes, class quests),
 * so it survives page reloads and multiple admins. Hidden once every step is
 * done or the admin closes it.
 *
 * Closing it hides it for this browser session only; it comes back next visit
 * until the setup is done. Ticking "Don't show again" before closing hides it
 * for good in this browser. The X used to always mean "for good", which left an
 * admin who closed it to get it out of the way with no way to find it again.
 */
export default function GettingStartedChecklist({ orgId, onNavigate, org = null }) {
  const steps = STEPS.filter((step) => !step.module || !moduleKnownOff(org, step.module))
  const dismissKey = `orgSetupChecklistDismissed_${orgId}`
  const [counts, setCounts] = useState(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  // Web storage can be unavailable (Safari private mode, restricted envs)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(dismissKey) === 'true' || sessionStorage.getItem(dismissKey) === 'true'
    } catch { return false }
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

  const doneCount = steps.filter(step => step.isDone(counts)).length
  if (doneCount === steps.length) return null

  const handleDismiss = () => {
    try {
      (dontShowAgain ? localStorage : sessionStorage).setItem(dismissKey, 'true')
    } catch { /* ignore */ }
    setDismissed(true)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Getting Started</h2>
          <p className="text-sm text-gray-500">
            {doneCount} of {steps.length} steps done — finish setting up your school.
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
          className="h-full bg-gradient-primary rounded-full transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <div className="space-y-1">
        {steps.map(step => {
          const done = step.isDone(counts)
          return (
            <button
              key={step.key}
              onClick={() => !done && onNavigate(step.tab, step.to(org))}
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

      <label className="mt-4 flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
        />
        Don't show again
      </label>
    </div>
  )
}
