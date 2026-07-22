import React from 'react'
import ModalOverlay from '../ui/ModalOverlay'
import {
  AcademicCapIcon,
  UserGroupIcon,
  HeartIcon,
  EnvelopeIcon,
  UserPlusIcon,
  UsersIcon,
  TableCellsIcon,
  LinkIcon
} from '@heroicons/react/24/outline'

function OptionButton({ icon: Icon, title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 text-left text-gray-700 hover:bg-gray-50 flex items-start gap-3 rounded-lg border border-gray-200 hover:border-optio-purple/40 transition-colors"
    >
      <Icon className="w-5 h-5 mt-0.5 flex-shrink-0 text-optio-purple" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-gray-500">{subtitle}</span>
      </span>
    </button>
  )
}

/**
 * AddPeopleChooser - Guided "who are you adding?" flow for org admins.
 *
 * Organizes every add-member path by the person being added (student,
 * teacher, parent) instead of by mechanism, so school admins don't need to
 * know which platform flow fits.
 */
export default function AddPeopleChooser({
  onClose,
  onBulkUsername,      // students, no email, many
  onCreateUsername,    // student, no email, single
  onBulkImport,        // students/staff with email, CSV
  onInvite,            // (role) => email invite
  onParentConnection   // (mode: 'invite' | 'existing') => parent modal
}) {
  const pick = (fn, ...args) => () => {
    onClose()
    fn(...args)
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg my-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold">Add People</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-5">Who are you adding to your school?</p>

        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AcademicCapIcon className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Students</span>
            </div>
            <div className="space-y-2">
              <OptionButton
                icon={UsersIcon}
                title="Add many students (no email)"
                subtitle="Paste your class list. Usernames and passwords are generated, with printable login cards."
                onClick={pick(onBulkUsername)}
              />
              <OptionButton
                icon={UserPlusIcon}
                title="Add one student (no email)"
                subtitle="Create a single username + password account."
                onClick={pick(onCreateUsername)}
              />
              <OptionButton
                icon={TableCellsIcon}
                title="Import students with email (CSV)"
                subtitle="Upload a spreadsheet of students who have email addresses."
                onClick={pick(onBulkImport)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <UserGroupIcon className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Teachers</span>
            </div>
            <OptionButton
              icon={EnvelopeIcon}
              title="Invite a teacher by email"
              subtitle="They get a sign-up link and join your school as a teacher."
              onClick={pick(onInvite, 'advisor')}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <HeartIcon className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parents</span>
            </div>
            <div className="space-y-2">
              <OptionButton
                icon={EnvelopeIcon}
                title="Invite a parent and link their kids"
                subtitle="One email invite that connects them to their students automatically."
                onClick={pick(onParentConnection, 'invite')}
              />
              <OptionButton
                icon={LinkIcon}
                title="Link an existing parent to a student"
                subtitle="Both accounts already exist — just connect them."
                onClick={pick(onParentConnection, 'existing')}
              />
            </div>
          </div>

          <div className="pt-1 border-t border-gray-100">
            <button
              onClick={pick(onInvite, 'student')}
              className="text-xs text-gray-500 hover:text-optio-purple mt-2"
            >
              Something else? Send a plain email invite (any role)
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
