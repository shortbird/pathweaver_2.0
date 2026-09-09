import React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline'

const DocsBreadcrumbs = ({ category, article }) => {
  const crumbs = [
    { label: 'Docs', to: '/docs' }
  ]

  if (category) {
    crumbs.push({ label: category.title, to: `/docs/${category.slug}` })
  }

  if (article) {
    crumbs.push({ label: article.title })
  }

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 mb-6 flex-wrap">
      <Link to="/docs" className="hover:text-optio-purple transition-colors">
        <HomeIcon className="w-4 h-4" />
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400" />
          {crumb.to ? (
            <Link to={crumb.to} className="hover:text-optio-purple transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export default DocsBreadcrumbs
