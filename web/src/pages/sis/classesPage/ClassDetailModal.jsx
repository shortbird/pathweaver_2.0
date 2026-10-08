/**
 * Extracted from sis/ClassesPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import ClassForm from '../../../components/sis/ClassForm'
import { ModalOverlay } from '../../../components/ui'
import ParentClassPreview from '../../../components/schedule/ClassDetailsModal'
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import ClassRoster from './ClassRoster'
import ClassWaitlist from './ClassWaitlist'
import CLASS_TABS from './CLASS_TABS'
import GlassTabBar from '../../../components/ui/GlassTabBar'
import { moduleKnownOff } from '../../../modules/moduleEnabled'

const ClassDetailModal = ({ cls, staff, timeBlocks = [], rooms = [], roomOccupancy = {}, orgId, initialTab = 'details', onClose, onSubmit, onToggleRegistration, onArchive, onRestore, onRosterChanged, org = null }) => {
  // Without the registration module there is no open/closed switch and no
  // waitlist to work (docs/MICROSCHOOL_FIRST_PLAN.md part 2).
  const showRegistration = !moduleKnownOff(org, 'registration')
  const tabs = CLASS_TABS.filter((t) => showRegistration || t.key !== 'waitlist')
  const [tab, setTab] = useState(tabs.some((t) => t.key === initialTab) ? initialTab : 'details')
  const [previewing, setPreviewing] = useState(false)
  const isOpen = cls.registration_status === 'open'
  const isArchived = cls.status === 'archived'

  if (previewing) {
    return (
      <ParentClassPreview
        item={cls}
        type="class"
        locked
        onClose={() => setPreviewing(false)}
      />
    )
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{cls.name}</h2>
          <div className="flex items-center gap-3">
            {/* Same door ClassesTable's expanded row has: the teacher's page
                for this class (attendance, quests, progress, This Week). The
                card view opens this modal instead of the row, so it needs
                the link too. */}
            <Link to={`/my-classes/${cls.id}`}
              className="text-sm font-medium text-optio-purple hover:underline">
              Class page
            </Link>
            <button onClick={() => setPreviewing(true)}
              className="text-sm font-medium text-optio-purple hover:underline">
              Preview
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>
        <div className="px-4 mt-2 shrink-0">
          <GlassTabBar
            align="start" aria-label="Class sections"
            tabs={tabs.map((t) => ({ id: t.key, label: t.label }))}
            active={tab} onSelect={setTab}
          />
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {tab === 'details' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
                <div className="text-sm text-neutral-700">
                  <span className="font-medium">{cls.enrolled_count ?? 0}</span>
                  {cls.capacity != null ? ` / ${cls.capacity}` : ''} enrolled
                  {showRegistration && (
                    <>
                      {' · '}Registration <span className={isOpen ? 'text-green-600 font-medium' : 'text-neutral-400'}>{isOpen ? 'open' : 'closed'}</span>
                    </>
                  )}
                </div>
                {showRegistration && (
                <button
                  type="button" role="switch" aria-checked={isOpen} aria-label="Toggle registration"
                  onClick={() => onToggleRegistration(cls)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${isOpen ? 'bg-green-500' : 'bg-neutral-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${isOpen ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                )}
              </div>

              <ClassForm inline initial={cls} staff={staff} timeBlocks={timeBlocks} rooms={rooms}
                roomOccupancy={roomOccupancy} onSubmit={onSubmit} org={org} />

              <div className="pt-1">
                {isArchived ? (
                  <button onClick={onRestore} className="text-sm font-medium text-optio-purple hover:underline">Restore class</button>
                ) : (
                  <button onClick={onArchive} className="text-sm text-red-500 hover:underline">Archive class</button>
                )}
              </div>
            </div>
          )}

          {tab === 'roster' && <ClassRoster classId={cls.id} className={cls.name} orgId={orgId} onChanged={onRosterChanged} />}
          {showRegistration && tab === 'waitlist' && <ClassWaitlist classId={cls.id} orgId={orgId} cls={cls} onChanged={onRosterChanged} />}
        </div>
      </div>
    </ModalOverlay>
  )
}

// Enrolled students for the class (sorted by last name).
//
// Two things the office asked to do from HERE rather than by going and finding
// the family first (iCreate, 2026-08-17): add a student to the class, and move
// one to another section of the same class. Moving is deliberately limited to
// sibling sections — the same class at a different time, which is what "she is
// in the wrong one" nearly always means, and the only move that cannot change
// what the family is charged.
// onChanged refreshes the parent's class list. Without it the roster panel's own
// count moved but the "X / Y enrolled" column, the Full chip and spots_left kept
// their stale values until the page was reopened (iCreate, 2026-08-26: "it
// doesn't update the enrolled number ... on a bunch of classes").

export default ClassDetailModal
