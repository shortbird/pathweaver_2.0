import React, { useState, useEffect, memo } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  BookOpenIcon, AcademicCapIcon, UserGroupIcon,
  BuildingOfficeIcon, Cog6ToothIcon, EyeIcon,
  RocketLaunchIcon
} from '@heroicons/react/24/outline'
import DocsSearch from '../../components/docs/DocsSearch'
import api from '../../services/api'

const iconMap = {
  'book-open': BookOpenIcon,
  'academic-cap': AcademicCapIcon,
  'user-group': UserGroupIcon,
  'building-office': BuildingOfficeIcon,
  'cog-6-tooth': Cog6ToothIcon,
  'eye': EyeIcon,
  'rocket-launch': RocketLaunchIcon,
}

const DocsLandingPage = () => {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      const res = await api.get('/api/public/docs/categories')
      setCategories(res.data.categories || [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  const getIcon = (iconName) => {
    const Icon = iconMap[iconName] || BookOpenIcon
    return Icon
  }

  return (
    <>
      <Helmet>
        <title>Help Center | Optio</title>
        <meta name="description" content="Find answers to your questions about using the Optio education platform." />
      </Helmet>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero section */}
        <div className="text-center mb-12">
          <Link to="/">
            <img
              src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
              alt="Optio"
              className="h-20 mx-auto mb-8"
            />
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            How can we help?
          </h1>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Search our documentation or browse by topic to find what you need.
          </p>
          <div className="max-w-xl mx-auto">
            <DocsSearch large />
          </div>
        </div>

        {/* Category grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                <div className="w-10 h-10 bg-gray-100 rounded-lg mb-4" />
                <div className="h-5 bg-gray-100 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-50 rounded w-full mb-1" />
                <div className="h-4 bg-gray-50 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-16">
            <BookOpenIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-600 mb-2">Documentation coming soon</h2>
            <p className="text-gray-500">We are building out our help center. Check back shortly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map(cat => {
              const Icon = getIcon(cat.icon)
              return (
                <Link
                  key={cat.id}
                  to={`/docs/${cat.slug}`}
                  className="group bg-white rounded-xl border border-gray-200 p-6 hover:border-optio-purple/30 hover:shadow-md transition-all"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 rounded-lg flex items-center justify-center mb-4 group-hover:from-optio-purple/20 group-hover:to-optio-pink/20 transition-colors">
                    <Icon className="w-5 h-5 text-optio-purple" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-optio-purple transition-colors">
                    {cat.title}
                  </h3>
                  {cat.description && (
                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{cat.description}</p>
                  )}
                  <span className="text-xs text-gray-400">
                    {cat.article_count || 0} {cat.article_count === 1 ? 'article' : 'articles'}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

export default memo(DocsLandingPage)
