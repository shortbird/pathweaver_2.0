import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import PersonFile from './PersonFile'

/** /admin/crm/people/:personId - one person's file as a full page. */
const PersonDetail = () => {
  const { personId } = useParams()
  return (
    <div>
      <Link
        to="/admin/crm/people"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-optio-purple transition-colors mb-3"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to people
      </Link>
      <div className="max-w-3xl">
        <PersonFile personId={personId} showHeader />
      </div>
    </div>
  )
}

export default PersonDetail
