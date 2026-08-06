import React, { useContext } from 'react'
import { Link } from 'react-router-dom'
import { OrganizationContext } from '../../contexts/OrganizationContext'

/**
 * "← iCreate" — the way back to the school page.
 *
 * These pages (billing, absences, calendar, resources, directory, portal,
 * requests, schedule) each had their own sidebar item until 2026-08-06. They
 * are cards on /school now, which means the school page is the only way in and
 * there is nothing pointing back out. iCreate filed exactly that complaint
 * three times in two minutes about the teacher-portal pages (see
 * BackToDashboard), so it is not a hypothetical.
 *
 * Named after the school, matching the nav item and the page you land back on.
 */
const BackToSchool = ({ className = '' }) => {
  // Read the context directly rather than through useOrganization: this renders
  // on eight pages, and one rendered outside the provider should fall back to a
  // plain label, not throw the page away.
  const school = useContext(OrganizationContext)?.school
  return (
    <Link
      to="/school"
      className={`inline-flex items-center gap-1 text-sm text-optio-purple hover:underline ${className}`}
    >
      <span aria-hidden="true">←</span>
      {school?.name || 'My school'}
    </Link>
  )
}

export default BackToSchool
