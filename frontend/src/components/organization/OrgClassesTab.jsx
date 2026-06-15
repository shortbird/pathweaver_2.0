import React, { useState } from 'react'
import { ClassList, ClassDetailPage } from '../classes'

/**
 * OrgClassesTab - Class management inside the org admin dashboard (/organization).
 *
 * Shows the organization's classes; selecting one opens its detail (Students,
 * Quests, Advisors, Settings). The Quests tab is where a quest's publish can be
 * scheduled for the class (when the org has the scheduled_publish feature).
 */
export default function OrgClassesTab({ orgId }) {
  const [selectedClass, setSelectedClass] = useState(null)

  if (selectedClass) {
    return (
      <ClassDetailPage
        classId={selectedClass.id}
        orgId={selectedClass.organization_id || orgId}
        onBack={() => setSelectedClass(null)}
      />
    )
  }

  return (
    <ClassList
      orgId={orgId}
      isAdvisorView={false}
      onSelectClass={setSelectedClass}
    />
  )
}
