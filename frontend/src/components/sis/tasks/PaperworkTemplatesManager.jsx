import React, { useState } from 'react'
import FormBuilder from './FormBuilder'
import { ChecklistTemplatesManager } from '../../../pages/sis/OnboardingPage'

/**
 * PaperworkTemplatesManager — unified authoring for request forms and onboarding checklists.
 *
 * Allows admins to build, edit, and manage both request forms and onboarding checklist
 * templates in one place across Task Center, Onboarding, and Forms.
 */
export default function PaperworkTemplatesManager({
  orgId,
  staff = [],
  defaultTab = 'forms',
  title = 'Paperwork templates',
  onChanged,
  initiallyOpen = false,
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [formsCount, setFormsCount] = useState(0)
  const [checklistsCount, setChecklistsCount] = useState(0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 font-semibold text-neutral-900"
        >
          <span
            className={`text-neutral-400 text-xs transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          >
            ▶
          </span>
          {title}
          <span className="text-xs font-normal text-neutral-400">
            ({formsCount + checklistsCount})
          </span>
        </button>

        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              setActiveTab('forms')
            }}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              open && activeTab === 'forms'
                ? 'bg-white shadow text-neutral-900 font-semibold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Request Forms {formsCount ? `(${formsCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              setActiveTab('checklists')
            }}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              open && activeTab === 'checklists'
                ? 'bg-white shadow text-neutral-900 font-semibold'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Checklist templates {checklistsCount ? `(${checklistsCount})` : ''}
          </button>
        </div>
      </div>

      <div className={open ? 'mt-3 pt-3 border-t border-gray-100' : 'hidden'}>
        <div className={activeTab === 'forms' ? '' : 'hidden'}>
          <FormBuilder orgId={orgId} staff={staff} embedded open={open && activeTab === 'forms'} onCount={setFormsCount} />
        </div>
        <div className={activeTab === 'checklists' ? '' : 'hidden'}>
          <ChecklistTemplatesManager orgId={orgId} onChanged={onChanged} embedded open={open && activeTab === 'checklists'} onCount={setChecklistsCount} />
        </div>
      </div>
    </div>
  )
}
