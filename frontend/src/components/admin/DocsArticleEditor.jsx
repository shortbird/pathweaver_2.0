import React, { useState, useEffect, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import toast from 'react-hot-toast'
import { ArrowLeftIcon, EyeIcon, PencilIcon } from '@heroicons/react/24/outline'
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

const DocsArticleEditor = ({ articleId, onBack }) => {
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
