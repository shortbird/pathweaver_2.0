import React, { useState, useEffect, memo } from 'react'
import toast from 'react-hot-toast'
import {
  PlusIcon, PencilSquareIcon, TrashIcon,
  FolderIcon, DocumentTextIcon, ChartBarIcon,
  EyeSlashIcon, MagnifyingGlassIcon, ArrowTopRightOnSquareIcon,
  SparklesIcon, ArrowPathIcon, LightBulbIcon
} from '@heroicons/react/24/outline'
import DocsArticleEditor from './DocsArticleEditor'
import DocsCategoryEditor from './DocsCategoryEditor'
import DocsAIPanel from './DocsAIPanel'
import api from '../../services/api'

const DocsManager = () => {
  const [view, setView] = useState('dashboard') // 'dashboard' | 'edit-article' | 'new-article'
  const [editArticleId, setEditArticleId] = useState(null)
  const [initialTopic, setInitialTopic] = useState('')
  const [categories, setCategories] = useState([])
  const [articles, setArticles] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCategoryEditor, setShowCategoryEditor] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)

  // AI panel state
  const [aiPanelType, setAiPanelType] = useState(null) // 'suggestions' | 'scaffold' | null
  const [aiPanelData, setAiPanelData] = useState(null)
  const [aiPanelLoading, setAiPanelLoading] = useState(false)

  // Search misses state
  const [searchMisses, setSearchMisses] = useState([])
  const [reindexing, setReindexing] = useState(false)

  useEffect(() => {
    loadData()
    loadSearchMisses()
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

  const loadSearchMisses = async () => {
    try {
      const res = await api.get('/api/admin/docs/ai/search-misses')
      setSearchMisses(res.data.misses || [])
    } catch {
      // silently fail -- search misses are non-critical
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
    setInitialTopic('')
    loadData()
  }

  // AI: Suggest missing docs
  const handleSuggestMissing = async () => {
    setAiPanelType('suggestions')
    setAiPanelData(null)
    setAiPanelLoading(true)
    try {
      const res = await api.post('/api/admin/docs/ai/suggest-missing', {})
      if (res.data.success) {
        setAiPanelData({
          gaps: res.data.gaps || [],
          coverage_score: res.data.coverage_score,
          summary: res.data.summary
        })
      } else {
        toast.error(res.data.error || 'Analysis failed')
        setAiPanelType(null)
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to run gap analysis')
      setAiPanelType(null)
    } finally {
      setAiPanelLoading(false)
    }
  }

  // AI: Scaffold structure
  const handleScaffold = async () => {
    setAiPanelType('scaffold')
    setAiPanelData(null)
    setAiPanelLoading(true)
    try {
      const res = await api.post('/api/admin/docs/ai/scaffold-structure', {})
      if (res.data.success) {
        setAiPanelData({ categories: res.data.categories || [] })
      } else {
        toast.error(res.data.error || 'Scaffolding failed')
        setAiPanelType(null)
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to scaffold structure')
      setAiPanelType(null)
    } finally {
      setAiPanelLoading(false)
    }
  }

  // AI: Reindex codebase
  const handleReindex = async () => {
    setReindexing(true)
    try {
      const res = await api.post('/api/admin/docs/ai/reindex', {})
      if (res.data.success) {
        toast.success(res.data.message || 'Codebase reindexed')
      } else {
        toast.error('Reindex failed')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reindex')
    } finally {
      setReindexing(false)
    }
  }

  // AI panel actions
  const handleAiPanelAction = async (action, payload) => {
    if (action === 'generate') {
      // Generate article from gap suggestion
      setAiPanelType(null)
      setInitialTopic(payload.topic || '')
      setEditArticleId(null)
      setView('new-article')
    } else if (action === 'generate-from-scaffold') {
      // Generate article from scaffold suggestion
      setAiPanelType(null)
      setInitialTopic(payload.title || '')
      setEditArticleId(null)
      setView('new-article')
    } else if (action === 'create-category') {
      // Create a category from scaffold
      try {
        await api.post('/api/admin/docs/categories', {
          title: payload.title,
          slug: payload.slug,
          description: payload.description || '',
          icon: payload.icon || '',
          is_published: true
        })
        toast.success(`Category "${payload.title}" created`)
        loadData()
      } catch (err) {
        const msg = err.response?.data?.error || 'Failed to create category'
        toast.error(msg)
      }
    } else if (action === 'create-all') {
      // Create all categories from scaffold
      const cats = payload.categories || []
      let created = 0
      for (const cat of cats) {
        try {
          await api.post('/api/admin/docs/categories', {
            title: cat.title,
            slug: cat.slug,
            description: cat.description || '',
            icon: cat.icon || '',
            is_published: true
          })
          created++
        } catch {
          // skip duplicates
        }
      }
      toast.success(`Created ${created}/${cats.length} categories`)
      loadData()
    }
  }

  // Generate article from search miss
  const handleGenerateFromMiss = (miss) => {
    setInitialTopic(miss.query || '')
    setEditArticleId(null)
    setView('new-article')
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
        initialTopic={initialTopic}
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

      {/* AI Tools Section */}
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-optio-purple" />
            <h2 className="font-semibold text-gray-900">AI Tools</h2>
          </div>
          <button
            onClick={handleReindex}
            disabled={reindexing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-white transition-colors disabled:opacity-50"
          >
            {reindexing ? (
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowPathIcon className="w-3.5 h-3.5" />
            )}
            Reindex Codebase
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSuggestMissing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-purple-200 rounded-lg hover:border-optio-purple hover:shadow-sm transition-all text-sm font-medium text-gray-800"
          >
            <LightBulbIcon className="w-4 h-4 text-optio-purple" />
            Suggest Missing Docs
          </button>
          <button
            onClick={handleScaffold}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-purple-200 rounded-lg hover:border-optio-purple hover:shadow-sm transition-all text-sm font-medium text-gray-800"
          >
            <FolderIcon className="w-4 h-4 text-optio-purple" />
            Scaffold All Docs
          </button>
          <button
            onClick={() => { setInitialTopic(''); setEditArticleId(null); setView('new-article') }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 text-sm font-medium"
          >
            <SparklesIcon className="w-4 h-4" />
            AI-Generate Article
          </button>
        </div>
      </div>

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
              onClick={() => { setEditArticleId(null); setInitialTopic(''); setView('new-article') }}
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
                  {article.is_published && article.slug && article.category?.slug && (
                    <a
                      href={`/docs/${article.category.slug}/${article.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-gray-400 hover:text-optio-purple rounded"
                      title="View on /docs"
                    >
                      <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    </a>
                  )}
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

      {/* Search-Miss Insights */}
      {searchMisses.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b">
            <MagnifyingGlassIcon className="w-5 h-5 text-optio-purple" />
            <h2 className="font-semibold text-gray-900">Search Misses</h2>
            <span className="text-xs text-gray-400">Queries with no results</span>
          </div>
          <div className="divide-y">
            {searchMisses.slice(0, 15).map(miss => (
              <div key={miss.id} className="flex items-center justify-between px-6 py-2.5 hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-900 font-medium">{miss.query}</span>
                    <span className="text-xs text-gray-400">{miss.miss_count}x searched</span>
                    <span className="text-xs text-gray-400">
                      Last: {new Date(miss.last_searched_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0 ml-3">
                  {miss.generated_article_id ? (
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                      Article Created
                    </span>
                  ) : (
                    <button
                      onClick={() => handleGenerateFromMiss(miss)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-optio-purple border border-optio-purple rounded-lg hover:bg-optio-purple hover:text-white transition-colors"
                    >
                      <SparklesIcon className="w-3 h-3" /> Generate Article
                    </button>
                  )}
                </div>
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

      {/* AI Panel Modal */}
      {aiPanelType && (
        <DocsAIPanel
          type={aiPanelType}
          data={aiPanelData}
          onClose={() => { setAiPanelType(null); setAiPanelData(null) }}
          onAction={handleAiPanelAction}
          loading={aiPanelLoading}
        />
      )}
    </div>
  )
}

export default memo(DocsManager)
