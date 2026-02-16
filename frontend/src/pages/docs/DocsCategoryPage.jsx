import React, { useState, useEffect, memo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsBreadcrumbs from '../../components/docs/DocsBreadcrumbs'
import DocsSearch from '../../components/docs/DocsSearch'
import api from '../../services/api'

const DocsCategoryPage = () => {
  const { categorySlug } = useParams()
  const [category, setCategory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadCategory()
  }, [categorySlug])

  const loadCategory = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/api/public/docs/categories/${categorySlug}`)
      setCategory(res.data.category)
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Category not found')
      } else {
        setError('Failed to load category')
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <DocsLayout>
        <div className="space-y-4">
          <div className="h-6 bg-gray-100 rounded w-48 animate-pulse" />
          <div className="h-10 bg-gray-100 rounded w-3/4 animate-pulse" />
          <div className="h-4 bg-gray-50 rounded w-full animate-pulse" />
          <div className="space-y-3 mt-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-50 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </DocsLayout>
    )
  }

  if (error || !category) {
    return (
      <DocsLayout>
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold text-gray-600 mb-2">{error || 'Category not found'}</h2>
          <Link to="/docs" className="text-optio-purple hover:underline">Back to Help Center</Link>
        </div>
      </DocsLayout>
    )
  }

  const articles = category.articles || []

  return (
    <>
      <Helmet>
        <title>{category.title} | Help Center | Optio</title>
        <meta name="description" content={category.description || `${category.title} documentation`} />
      </Helmet>

      <DocsLayout>
        <DocsBreadcrumbs category={category} />

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{category.title}</h1>
          {category.description && (
            <p className="text-gray-600">{category.description}</p>
          )}
        </div>

        <div className="mb-8 max-w-lg">
          <DocsSearch />
        </div>

        {articles.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-xl">
            <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No articles in this category yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map(article => (
              <Link
                key={article.id}
                to={`/docs/${categorySlug}/${article.slug}`}
                className="block bg-white border border-gray-200 rounded-lg p-5 hover:border-optio-purple/30 hover:shadow-sm transition-all group"
              >
                <h3 className="font-semibold text-gray-900 group-hover:text-optio-purple transition-colors mb-1">
                  {article.title}
                </h3>
                {article.summary && (
                  <p className="text-sm text-gray-500 line-clamp-2">{article.summary}</p>
                )}
                {article.target_roles?.length > 0 && (
                  <div className="flex gap-1.5 mt-2">
                    {article.target_roles.map(role => (
                      <span key={role} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {role}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </DocsLayout>
    </>
  )
}

export default memo(DocsCategoryPage)
