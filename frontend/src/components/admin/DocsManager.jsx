import React, { useState, useEffect, memo } from 'react'
import toast from 'react-hot-toast'
import {
  PlusIcon, PencilSquareIcon, TrashIcon,
  FolderIcon, DocumentTextIcon, ChartBarIcon,
  EyeIcon, EyeSlashIcon, MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import DocsArticleEditor from './DocsArticleEditor'
import DocsCategoryEditor from './DocsCategoryEditor'
import api from '../../services/api'

const DocsManager = () => {
  const [view, setView] = useState('dashboard') // 'dashboard' | 'edit-article' | 'new-article'
  const [editArticleId, setEditArticleId] = useState(null)
  const [categories, setCategories] = useState([])
  const [articles, setArticles] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCategoryEditor, setShowCategoryEditor] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [catRes, artRes, analyticsRes] = await Promise.all([
        api.get('/api/admin/docs/categories'),
        api.get('/api/admin/docs/articles'),
        api.get('/api/admin/docs/analytics')
      ])
      setCategories(catRes.data.categories || [])
      setArticles(artRes.data.articles || [])
      setAnalytics(analyticsRes.data.analytics || null)
    } catch {
      toast.error('Failed to load docs data')
    } finally {
      setLoading(false)
    }
  }

  const deleteCategory = async (cat) => {
    if (!window.confirm(`Delete "${cat.title}" and all its articles? This cannot be undone.`)) return
    try {
      await api.delete(`/api/admin/docs/categories/${cat.id}`)
      toast.success('Category deleted')
      loadData()
    } catch {
      toast.error('Failed to delete category')
    }
  }

  const deleteArticle = async (article) => {
    if (!window.confirm(`Delete "${article.title}"? This cannot be undone.`)) return
    try {
      await api.delete(`/api/admin/docs/articles/${article.id}`)
      toast.success('Article deleted')
      loadData()
    } catch {
      toast.error('Failed to delete article')
    }
  }

  const handleCategorySaved = () => {
    setShowCategoryEditor(false)
    setEditingCategory(null)
    loadData()
  }

  const handleArticleBack = () => {
    setView('dashboard')
    setEditArticleId(null)
    loadData()
  }

  // Filter articles by search term
  const filteredArticles = articles.filter(a => {
    if (!searchTerm) return true
    const s = searchTerm.toLowerCase()
    return a.title?.toLowerCase().includes(s) ||
           a.summary?.toLowerCase().includes(s) ||
           a.category?.title?.toLowerCase().includes(s)
  })

  // Show article editor view
  if (view === 'edit-article' || view === 'new-article') {
    return (
      <DocsArticleEditor
        articleId={editArticleId}
        onBack={handleArticleBack}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Analytics Summary */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{analytics.total_categories}</div>
            <div className="text-sm text-gray-500">Categories</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{analytics.total_articles}</div>
            <div className="text-sm text-gray-500">Articles</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{analytics.published_articles}</div>
            <div className="text-sm text-gray-500">Published</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{analytics.total_views?.toLocaleString()}</div>
            <div className="text-sm text-gray-500">Total Views</div>
          </div>
        </div>
      )}

      {/* Categories Section */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FolderIcon className="w-5 h-5 text-optio-purple" />
            <h2 className="font-semibold text-gray-900">Categories</h2>
          </div>
          <button
            onClick={() => { setEditingCategory(null); setShowCategoryEditor(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 text-sm font-medium"
          >
            <PlusIcon className="w-4 h-4" /> Add Category
          </button>
        </div>

        {categories.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            No categories yet. Create one to get started.
          </div>
        ) : (
          <div className="divide-y">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="text-gray-900 font-medium">{cat.title}</span>
                  <span className="text-xs text-gray-400">{cat.article_count || 0} articles</span>
                  {!cat.is_published && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">Draft</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditingCategory(cat); setShowCategoryEditor(true) }}
                    className="p-1.5 text-gray-400 hover:text-optio-purple rounded"
                    title="Edit"
                  >
                    <PencilSquareIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteCategory(cat)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    title="Delete"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Articles Section */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <DocumentTextIcon className="w-5 h-5 text-optio-purple" />
            <h2 className="font-semibold text-gray-900">Articles</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search articles..."
                className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple focus:border-optio-purple w-48"
              />
            </div>
            <button
              onClick={() => { setEditArticleId(null); setView('new-article') }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 text-sm font-medium whitespace-nowrap"
            >
              <PlusIcon className="w-4 h-4" /> New Article
            </button>
          </div>
        </div>

        {filteredArticles.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            {searchTerm ? 'No articles match your search.' : 'No articles yet. Create one to get started.'}
          </div>
        ) : (
          <div className="divide-y">
            {filteredArticles.map(article => (
              <div key={article.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">{article.title}</span>
                    {!article.is_published && (
                      <EyeSlashIcon className="w-4 h-4 text-yellow-500 flex-shrink-0" title="Draft" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                    {article.category && (
                      <span>{article.category.title}</span>
                    )}
                    <span>{article.view_count || 0} views</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setEditArticleId(article.id); setView('edit-article') }}
                    className="p-1.5 text-gray-400 hover:text-optio-purple rounded"
                    title="Edit"
                  >
                    <PencilSquareIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteArticle(article)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    title="Delete"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Articles by Views */}
      {analytics?.top_articles?.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b">
            <ChartBarIcon className="w-5 h-5 text-optio-purple" />
            <h2 className="font-semibold text-gray-900">Most Viewed</h2>
          </div>
          <div className="divide-y">
            {analytics.top_articles.slice(0, 10).map((article, i) => (
              <div key={article.id} className="flex items-center justify-between px-6 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-5 text-right">{i + 1}.</span>
                  <span className="text-sm text-gray-900">{article.title}</span>
                </div>
                <span className="text-sm text-gray-500">{article.view_count} views</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Editor Modal */}
      {showCategoryEditor && (
        <DocsCategoryEditor
          category={editingCategory}
          onClose={() => { setShowCategoryEditor(false); setEditingCategory(null) }}
          onSaved={handleCategorySaved}
        />
      )}
    </div>
  )
}

export default memo(DocsManager)
