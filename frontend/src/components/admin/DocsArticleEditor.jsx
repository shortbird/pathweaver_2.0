import React, { useState, useEffect, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import toast from 'react-hot-toast'
import {
  ArrowLeftIcon, EyeIcon, PencilIcon, SparklesIcon,
  ArrowPathIcon, ExclamationTriangleIcon, CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import MarkdownEditor from '../curriculum/MarkdownEditor'
import api from '../../services/api'

const proseClasses = `
  prose prose-lg max-w-none
  prose-headings:font-bold prose-headings:text-gray-900
  prose-h1:text-4xl prose-h1:mb-6 prose-h1:mt-8
  prose-h2:text-2xl prose-h2:mb-4 prose-h2:mt-6 prose-h2:text-optio-purple prose-h2:border-l-4 prose-h2:border-optio-purple prose-h2:pl-4
  prose-h3:text-xl prose-h3:mb-3 prose-h3:mt-5
  prose-p:text-gray-700 prose-p:leading-relaxed prose-p:my-3
  prose-a:text-optio-purple prose-a:font-medium
  prose-strong:text-gray-900 prose-strong:font-semibold
  prose-ul:text-gray-700 prose-ul:my-4
  prose-ol:text-gray-700 prose-ol:my-4
  prose-li:my-1.5
  prose-code:bg-gray-100 prose-code:px-2 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:text-optio-purple
  prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-xl prose-pre:p-5 prose-pre:shadow-lg
  prose-blockquote:border-l-4 prose-blockquote:border-optio-purple prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-gray-600
`.trim()

const ROLE_OPTIONS = ['student', 'parent', 'advisor', 'org_admin', 'observer']

const SEVERITY_COLORS = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-600'
}

const DocsArticleEditor = ({ articleId, onBack, initialTopic }) => {
  const isEditing = !!articleId
  const [categories, setCategories] = useState([])
  const [tab, setTab] = useState('edit') // 'edit' | 'preview'
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!articleId)
  const [form, setForm] = useState({
    title: '',
    slug: '',
    content: '',
    summary: '',
    category_id: '',
    target_roles: [],
    sort_order: 0,
    is_published: true
  })

  // AI generation state
  const [aiTopic, setAiTopic] = useState(initialTopic || '')
  const [aiHints, setAiHints] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiBanner, setAiBanner] = useState(false)

  // Freshness check state
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updateResults, setUpdateResults] = useState(null)

  useEffect(() => {
    loadCategories()
    if (articleId) loadArticle()
  }, [articleId])

  const loadCategories = async () => {
    try {
      const res = await api.get('/api/admin/docs/categories')
      setCategories(res.data.categories || [])
    } catch {
      // silently fail
    }
  }

  const loadArticle = async () => {
    try {
      const res = await api.get(`/api/admin/docs/articles/${articleId}`)
      const a = res.data.article
      setForm({
        title: a.title || '',
        slug: a.slug || '',
        content: a.content || '',
        summary: a.summary || '',
        category_id: a.category_id || '',
        target_roles: a.target_roles || [],
        sort_order: a.sort_order || 0,
        is_published: a.is_published !== false
      })
    } catch {
      toast.error('Failed to load article')
    } finally {
      setLoading(false)
    }
  }

  const handleTitleChange = (e) => {
    const title = e.target.value
    setForm(prev => ({
      ...prev,
      title,
      slug: isEditing ? prev.slug : title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
    }))
  }

  const toggleRole = (role) => {
    setForm(prev => ({
      ...prev,
      target_roles: prev.target_roles.includes(role)
        ? prev.target_roles.filter(r => r !== role)
        : [...prev.target_roles, role]
    }))
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!form.content.trim()) {
      toast.error('Content is required')
      return
    }

    setSaving(true)
    try {
      if (isEditing) {
        await api.put(`/api/admin/docs/articles/${articleId}`, form)
        toast.success('Article updated')
      } else {
        await api.post('/api/admin/docs/articles', form)
        toast.success('Article created')
      }
      onBack()
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to save article'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // AI: Generate article
  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) {
      toast.error('Enter a topic for AI generation')
      return
    }

    setAiGenerating(true)
    try {
      const res = await api.post('/api/admin/docs/ai/generate-article', {
        topic: aiTopic.trim(),
        target_roles: form.target_roles,
        context_hints: aiHints.trim() ? aiHints.split(',').map(h => h.trim()) : []
      })

      if (res.data.success && res.data.article) {
        const a = res.data.article
        // Match suggested_category to an actual category ID
        let categoryId = form.category_id
        if (a.suggested_category) {
          const match = categories.find(c =>
            c.title.toLowerCase().includes(a.suggested_category.toLowerCase()) ||
            a.suggested_category.toLowerCase().includes(c.title.toLowerCase())
          )
          if (match) categoryId = match.id
        }

        setForm(prev => ({
          ...prev,
          title: a.title || prev.title,
          slug: a.slug || prev.slug,
          summary: a.summary || prev.summary,
          content: a.content || prev.content,
          target_roles: a.target_roles?.length ? a.target_roles : prev.target_roles,
          category_id: categoryId
        }))
        setAiBanner(true)
        toast.success('Article generated')
      } else {
        toast.error(res.data.error || 'Generation failed')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate article')
    } finally {
      setAiGenerating(false)
    }
  }

  // AI: Check for updates
  const handleCheckUpdates = async () => {
    if (!articleId) return

    setCheckingUpdates(true)
    setUpdateResults(null)
    try {
      const res = await api.post(`/api/admin/docs/ai/suggest-updates/${articleId}`, {})
      if (res.data.success) {
        setUpdateResults({
          needs_update: res.data.needs_update,
          confidence: res.data.confidence,
          issues: res.data.issues || [],
          summary: res.data.summary || ''
        })
      } else {
        toast.error(res.data.error || 'Check failed')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to check for updates')
    } finally {
      setCheckingUpdates(false)
    }
  }

  // AI: Apply a suggested fix to content
  const handleApplyFix = (issue) => {
    if (issue.suggested_fix) {
      // Append fix note to content as a placeholder
      setForm(prev => ({
        ...prev,
        content: prev.content + `\n\n<!-- AI FIX (${issue.type}): ${issue.suggested_fix} -->\n`
      }))
      toast.success('Fix note added to content. Review and edit manually.')
    }
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Docs
        </button>
        <div className="flex gap-2">
          {isEditing && (
            <button
              onClick={handleCheckUpdates}
              disabled={checkingUpdates}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-optio-purple border border-optio-purple hover:bg-optio-purple hover:text-white transition-colors disabled:opacity-50"
            >
              {checkingUpdates ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <SparklesIcon className="w-4 h-4" />
              )}
              Check for Updates
            </button>
          )}
          <button
            onClick={() => setTab('edit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'edit' ? 'bg-optio-purple text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <PencilIcon className="w-4 h-4" /> Edit
          </button>
          <button
            onClick={() => setTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'preview' ? 'bg-optio-purple text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <EyeIcon className="w-4 h-4" /> Preview
          </button>
        </div>
      </div>

      {/* AI-generated banner */}
      {aiBanner && (
        <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-optio-purple" />
            <span className="text-sm text-purple-800">AI-generated content -- please review before publishing</span>
          </div>
          <button onClick={() => setAiBanner(false)} className="p-1 text-purple-400 hover:text-purple-600">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Freshness check results */}
      {updateResults && (
        <div className={`rounded-lg border p-4 ${updateResults.needs_update ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {updateResults.needs_update ? (
                <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />
              ) : (
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              )}
              <span className={`font-medium ${updateResults.needs_update ? 'text-yellow-800' : 'text-green-800'}`}>
                {updateResults.needs_update ? 'Updates Recommended' : 'Article is Up-to-Date'}
              </span>
              {updateResults.confidence !== undefined && (
                <span className="text-xs text-gray-500">
                  Confidence: {Math.round(updateResults.confidence * 100)}%
                </span>
              )}
            </div>
            <button onClick={() => setUpdateResults(null)} className="p-1 text-gray-400 hover:text-gray-600">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
          {updateResults.summary && (
            <p className="text-sm text-gray-600 mb-3">{updateResults.summary}</p>
          )}
          {updateResults.issues?.length > 0 && (
            <div className="space-y-2">
              {updateResults.issues.map((issue, i) => (
                <div key={i} className="bg-white rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.medium}`}>
                          {issue.severity}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">{issue.type}</span>
                      </div>
                      <p className="text-sm text-gray-900">{issue.description}</p>
                      {issue.suggested_fix && (
                        <p className="text-sm text-gray-500 mt-1">
                          <span className="font-medium">Fix:</span> {issue.suggested_fix}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleApplyFix(issue)}
                      className="flex-shrink-0 px-2.5 py-1 text-xs font-medium text-optio-purple border border-optio-purple rounded hover:bg-optio-purple hover:text-white transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Generation section (new articles only) */}
      {!isEditing && tab === 'edit' && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <SparklesIcon className="w-5 h-5 text-optio-purple" />
            <h3 className="font-semibold text-gray-900">Generate with AI</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                What should this article be about?
              </label>
              <input
                type="text"
                value={aiTopic}
                onChange={e => setAiTopic(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
                placeholder="e.g., How to create and manage quests"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Context hints <span className="text-gray-400 font-normal">(optional, comma-separated)</span>
              </label>
              <input
                type="text"
                value={aiHints}
                onChange={e => setAiHints(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
                placeholder="e.g., quest creation, student enrollment, XP tracking"
              />
            </div>
            <button
              onClick={handleAiGenerate}
              disabled={aiGenerating || !aiTopic.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium text-sm disabled:opacity-50"
            >
              {aiGenerating ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <SparklesIcon className="w-4 h-4" />
                  Generate with AI
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {tab === 'edit' ? (
        <div className="space-y-4">
          {/* Title & Slug */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={handleTitleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
                placeholder="How to Create a Quest"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={e => setForm(prev => ({ ...prev, slug: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple font-mono text-sm"
                placeholder="how-to-create-a-quest"
              />
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
            <input
              type="text"
              value={form.summary}
              onChange={e => setForm(prev => ({ ...prev, summary: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
              placeholder="1-2 sentence preview for search results"
            />
          </div>

          {/* Category, Sort, Published */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category_id}
                onChange={e => setForm(prev => ({ ...prev, category_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
              >
                <option value="">-- Select --</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={e => setForm(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={e => setForm(prev => ({ ...prev, is_published: e.target.checked }))}
                  className="rounded text-optio-purple focus:ring-optio-purple"
                />
                <span className="text-sm text-gray-700">Published</span>
              </label>
            </div>
          </div>

          {/* Target Roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Target Roles</label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    form.target_roles.includes(role)
                      ? 'bg-optio-purple text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          {/* Content editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content (Markdown)</label>
            <MarkdownEditor
              value={form.content}
              onChange={(val) => setForm(prev => ({ ...prev, content: val }))}
              placeholder="Write your article content in markdown..."
            />
          </div>
        </div>
      ) : (
        /* Preview tab */
        <div className="bg-white border border-gray-200 rounded-xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{form.title || 'Untitled'}</h1>
          {form.summary && (
            <p className="text-gray-600 mb-6 italic">{form.summary}</p>
          )}
          <div className={proseClasses}>
            <ReactMarkdown>{form.content || '*No content yet*'}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Save button (visible on both tabs) */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium disabled:opacity-50"
        >
          {saving ? 'Saving...' : (isEditing ? 'Update Article' : 'Create Article')}
        </button>
      </div>
    </div>
  )
}

export default memo(DocsArticleEditor)
