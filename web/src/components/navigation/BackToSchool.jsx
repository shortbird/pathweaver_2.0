import React, { useContext } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { OrganizationContext } from '../../contexts/OrganizationContext'

/**
 * The back button to the school page, top-left of every page /school links to.
 *
 * These pages (billing, absences, calendar, resources, directory, portal,
 * requests, schedule) each had their own sidebar item until 2026-08-06. They
 * are cards on /school now, which means the school page is the only way in and
 * there is nothing pointing back out. iCreate filed exactly that complaint
 * three times in two minutes about the teacher-portal pages (see
 * BackToDashboard), so it is not a hypothetical.
 *
 * A BUTTON, not a text link: the "← iCreate" text-link version shipped first
 * and was reported as the pages having no back button at all (2026-08-23) —
 * bare purple text at the top of a page does not read as navigation.
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
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:text-optio-purple hover:border-optio-purple/60 hover:shadow-sm transition-all ${className}`}
    >
      <ArrowLeftIcon aria-hidden="true" className="w-4 h-4" />
      {school?.name || 'My school'}
    </Link>
  )
}

export default BackToSchool
