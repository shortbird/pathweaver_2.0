import React, { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

const DocsSidebar = () => {
  const { categorySlug, articleSlug } = useParams()
  const [categories, setCategories] = useState([])
  const [expanded, setExpanded] = useState({})
  const [articlesByCategory, setArticlesByCategory] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCategories()
  }, [])

  // Auto-expand the active category and load its articles
  useEffect(() => {
    if (categorySlug && categories.length > 0) {
      setExpanded(prev => ({ ...prev, [categorySlug]: true }))
      const cat = categories.find(c => c.slug === categorySlug)
      if (cat && !articlesByCategory[cat.id]) {
        api.get(`/api/public/docs/categories/${categorySlug}`)
          .then(res => {
            setArticlesByCategory(prev => ({
              ...prev,
              [cat.id]: res.data.category?.articles || []
            }))
          })
          .catch(() => {})
      }
    }
  }, [categorySlug, categories])

  const loadCategories = async () => {
    try {
      const res = await api.get('/api/public/docs/categories')
      setCategories(res.data.categories || [])
    } catch {
      // silently fail - sidebar is supplementary
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = async (cat) => {
    const slug = cat.slug
    const isExpanding = !expanded[slug]
    setExpanded(prev => ({ ...prev, [slug]: isExpanding }))

    // Load articles for this category if not cached
    if (isExpanding && !articlesByCategory[cat.id]) {
      try {
        const res = await api.get(`/api/public/docs/categories/${slug}`)
        setArticlesByCategory(prev => ({
          ...prev,
          [cat.id]: res.data.category?.articles || []
        }))
      } catch {
        // silently fail
      }
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <nav className="space-y-1">
      <Link
        to="/docs"
        className={`block px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
          !categorySlug
            ? 'bg-optio-purple/10 text-optio-purple'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        All Topics
      </Link>

      {categories.map(cat => (
        <div key={cat.id}>
          <button
            onClick={() => toggleCategory(cat)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              categorySlug === cat.slug
                ? 'bg-optio-purple/10 text-optio-purple font-semibold'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span className="truncate">{cat.title}</span>
            {expanded[cat.slug] ? (
              <ChevronDownIcon className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ChevronRightIcon className="w-4 h-4 flex-shrink-0" />
            )}
          </button>

          {expanded[cat.slug] && (
            <div className="ml-4 mt-1 space-y-0.5">
              {(articlesByCategory[cat.id] || []).map(article => (
                <Link
                  key={article.id}
                  to={`/docs/${cat.slug}/${article.slug}`}
                  className={`block px-3 py-1.5 rounded text-sm transition-colors ${
                    articleSlug === article.slug
                      ? 'text-optio-purple font-medium bg-optio-purple/5'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {article.title}
                </Link>
              ))}
              {(articlesByCategory[cat.id] || []).length === 0 && (
                <p className="px-3 py-1.5 text-xs text-gray-400 italic">No articles yet</p>
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}

export default DocsSidebar
