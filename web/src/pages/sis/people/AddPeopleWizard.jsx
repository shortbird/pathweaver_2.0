import React, { useContext, useState } from 'react'
import {
  DocumentArrowUpIcon, HomeIcon, IdentificationIcon, LinkIcon, QueueListIcon, TableCellsIcon, UserPlusIcon,
} from '@heroicons/react/24/outline'

import { Modal } from '../../../components/ui/Modal'
import TeacherModal from '../../../components/sis/TeacherModal'
import AddFamilyForm from './AddFamilyForm'
import AddStudentForm from './AddStudentForm'
import RosterImport from './RosterImport'
import { BulkUsernamesForm } from './LoginCards'
import SignUpLinks from './SignUpLinks'
import BulkUserImport from '../../../components/admin/BulkUserImport'
import { AuthContext } from '../../../contexts/AuthContext'
import { canGrantAdmin } from '../sisRole'

/**
 * The People page's "+ Add": one door that asks what the admin is doing, not
 * which database role to create (2026-10-12).
 *
 * It replaced a menu of Person / Teacher / Family. "Person" was a role
 * dropdown with a create-now-or-invite toggle, "Teacher" a different dialog,
 * and "Family" an empty household with only a name, so the office had to know
 * the data model to add a family. Now there are four jobs:
 *
 *   A family          parents and children together (AddFamilyForm)
 *   A staff member    teacher, coordinator or admin (TeacherModal)
 *   A student         one child, usually into a family you have (AddStudentForm)
 *   Many people       a roster spreadsheet (RosterImport, which was the
 *                     superadmin dashboard's Roster Import page)
 *
 * Three more came from the web organization console when every org became an
 * SIS org (2026-10-15):
 *
 *   Many students, no email   a pasted list of names -> username accounts and
 *                             login cards (BulkUsernamesForm)
 *   People with roles (CSV)   the console's CSV import, one role per row, staff
 *                             included (BulkUserImport). Admins only: a row may
 *                             say org_admin, and the route is org_admin-only.
 *                             RosterImport was not stretched to take it: its
 *                             rows are families (a student and a parent), and a
 *                             teacher's row has neither.
 *   Sign-up links             the standing join link per role, and the email
 *                             invitations still waiting (SignUpLinks)
 *
 * Observers are not here on purpose: a parent invites them, not the school.
 *
 * `initialPath` opens straight onto one job: the dashboard's "Add a family"
 * link (/people?add=family) lands on the family form.
 */

const PATHS = [
  { key: 'family', title: 'A family', sub: 'Parents and their children, together.', Icon: HomeIcon },
  { key: 'staff', title: 'A staff member', sub: 'A teacher, a coordinator or an admin.', Icon: IdentificationIcon },
  { key: 'student', title: 'A student', sub: 'One child, into a family you already have.', Icon: UserPlusIcon },
  { key: 'roster', title: 'Many people', sub: 'Paste or upload a spreadsheet of students and parents.', Icon: TableCellsIcon },
  { key: 'usernames', title: 'Many students, no email', sub: 'Paste a list of names. Each gets a username and a login card.', Icon: QueueListIcon },
  { key: 'csv', title: 'People with roles (CSV)', sub: 'A CSV file with a role on each row, staff included.', Icon: DocumentArrowUpIcon, adminOnly: true },
  { key: 'links', title: 'Sign-up links', sub: 'A link people use to make their own account.', Icon: LinkIcon },
]

const TITLES = {
  family: 'Add a family',
  student: 'Add a student',
  roster: 'Add people from a spreadsheet',
  usernames: 'Add students without email',
  csv: 'Add people from a CSV file',
  links: 'Sign-up links',
}

export default function AddPeopleWizard({
  orgId, orgName, placeholders = [], initialPath = null, onClose, onChanged, onOpenFamily,
}) {
  const [path, setPath] = useState(initialPath)
  const back = () => setPath(null)
  // Context directly, not useAuth(): the wizard renders bare in tests.
  const viewer = useContext(AuthContext)?.user
  const paths = PATHS.filter((p) => !p.adminOnly || canGrantAdmin(viewer))

  // The staff form keeps its own dialog: it has two decision screens of its
  // own (a placeholder teacher, an account that already exists).
  if (path === 'staff') {
    return (
      <TeacherModal orgId={orgId} placeholders={placeholders} onBack={back} onClose={onClose}
        onSaved={() => { onChanged?.(); onClose() }} />
    )
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={path ? TITLES[path] : 'Add people'}
      size="lg"
      maxWidthClassName={path === 'roster' || path === 'csv' ? 'max-w-6xl' : ''}
      bodyClassName="overflow-y-auto"
    >
      {!path && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {paths.map(({ key, title, sub, Icon }) => (
            <button key={key} type="button" onClick={() => setPath(key)}
              className="text-left rounded-xl border border-gray-200 p-4 hover:border-optio-purple hover:bg-optio-purple/5 transition-colors focus:outline-none focus:ring-2 focus:ring-optio-purple">
              <Icon className="w-6 h-6 text-optio-purple mb-2" aria-hidden="true" />
              <span className="block font-semibold text-neutral-900">{title}</span>
              <span className="block text-sm text-neutral-500 mt-0.5">{sub}</span>
            </button>
          ))}
        </div>
      )}
      {path === 'family' && (
        <AddFamilyForm orgId={orgId} onBack={initialPath ? onClose : back} onDone={onClose} onCreated={onChanged}
          onOpenFamily={(id) => { onClose(); if (id) onOpenFamily?.(id) }} />
      )}
      {path === 'student' && <AddStudentForm orgId={orgId} onBack={back} onDone={onClose} onCreated={onChanged} />}
      {path === 'usernames' && (
        <BulkUsernamesForm orgId={orgId} orgName={orgName} onBack={back} onDone={onClose} onCreated={onChanged} />
      )}
      {path === 'csv' && canGrantAdmin(viewer) && (
        <div className="space-y-4">
          <BulkUserImport organizationId={orgId} onImportComplete={onChanged} />
          <button type="button" onClick={back} className="text-sm text-neutral-500 hover:underline">Back</button>
        </div>
      )}
      {path === 'links' && <SignUpLinks orgId={orgId} onBack={back} />}
      {path === 'roster' && (
        <div className="space-y-4">
          <RosterImport orgId={orgId} orgName={orgName} onImported={onChanged} />
          <button type="button" onClick={back} className="text-sm text-neutral-500 hover:underline">Back</button>
        </div>
      )}
    </Modal>
  )
}
