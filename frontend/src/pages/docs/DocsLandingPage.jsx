import React, { useState, useEffect, memo } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import {
  BookOpenIcon, AcademicCapIcon, UserGroupIcon,
  BuildingOfficeIcon, Cog6ToothIcon, EyeIcon,
  RocketLaunchIcon, ChevronRightIcon, MapIcon,
  HomeIcon, LightBulbIcon, BuildingLibraryIcon
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
  'map': MapIcon,
  'home': HomeIcon,
  'light-bulb': LightBulbIcon,
  'building-library': BuildingLibraryIcon,
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
    return iconMap[iconName] || BookOpenIcon
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

        {/* Category sections with articles */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="animate-pulse">
                <div className="h-6 bg-gray-100 rounded w-48 mb-4" />
                <div className="space-y-2">
                  <div className="h-4 bg-gray-50 rounded w-full" />
                  <div className="h-4 bg-gray-50 rounded w-5/6" />
                  <div className="h-4 bg-gray-50 rounded w-3/4" />
                </div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
            {categories.map(cat => {
              const Icon = getIcon(cat.icon)
              const articles = cat.articles || []

              return (
                <section key={cat.id}>
                  {/* Category header */}
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-8 h-8 bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-optio-purple" />
                    </div>
                    <Link
                      to={`/docs/${cat.slug}`}
                      className="text-lg font-semibold text-gray-900 hover:text-optio-purple transition-colors"
                    >
                      {cat.title}
                    </Link>
                  </div>
                  {cat.description && (
                    <p className="text-sm text-gray-500 mb-3 ml-11">{cat.description}</p>
                  )}

                  {/* Article list */}
                  {articles.length > 0 ? (
                    <div className="ml-11 border-l border-gray-200">
                      {articles.map(article => (
                        <Link
                          key={article.id}
                          to={`/docs/${cat.slug}/${article.slug}`}
                          className="group flex items-center gap-2 pl-4 py-1.5 -ml-px border-l-2 border-transparent hover:border-optio-purple transition-colors"
                        >
                          <span className="text-sm text-gray-700 group-hover:text-optio-purple transition-colors">
                            {article.title}
                          </span>
                          <ChevronRightIcon className="w-3 h-3 text-gray-300 group-hover:text-optio-purple transition-colors flex-shrink-0" />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 ml-11 italic">No articles yet</p>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

export default memo(DocsLandingPage)
