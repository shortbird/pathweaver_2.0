import React, { useState, useEffect, memo } from 'react'
import toast from 'react-hot-toast'
import {
  ArrowLeftIcon, EyeIcon, PencilIcon, ViewColumnsIcon
} from '@heroicons/react/24/outline'
import MarkdownEditor from '../curriculum/MarkdownEditor'
import DocsMarkdown from '../docs/DocsMarkdown'
import api from '../../services/api'

const ROLE_OPTIONS = ['student', 'parent', 'advisor', 'org_admin', 'observer']

const DocsArticleEditor = ({ articleId, onBack }) => {
  const isEditing = !!articleId
  const [categories, setCategories] = useState([])
  const [tab, setTab] = useState('split') // 'edit' | 'split' | 'preview'
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

  const handleImageUpload = async (file) => {
    const formData = new FormData()
    formData.append('image', file)
    try {
      const res = await api.post('/api/admin/docs/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return res.data.url
    } catch (err) {
      toast.error(err.response?.data?.error || 'Image upload failed')
      return null
    }
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
            onClick={() => setTab('split')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'split' ? 'bg-optio-purple text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ViewColumnsIcon className="w-4 h-4" /> Split
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

      {tab !== 'preview' ? (
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
            {tab === 'split' ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                <MarkdownEditor
                  value={form.content}
                  onChange={(val) => setForm(prev => ({ ...prev, content: val }))}
                  placeholder="Write your article content in markdown..."
                  onImageUpload={handleImageUpload}
                />
                <div className="border border-gray-200 rounded-lg bg-white p-6 max-h-[600px] overflow-y-auto">
                  <DocsMarkdown content={form.content || '*Live preview appears here as you type*'} />
                </div>
              </div>
            ) : (
              <MarkdownEditor
                value={form.content}
                onChange={(val) => setForm(prev => ({ ...prev, content: val }))}
                placeholder="Write your article content in markdown..."
                onImageUpload={handleImageUpload}
              />
            )}
          </div>
        </div>
      ) : (
        /* Preview tab - full-page render identical to the public article page */
        <div className="bg-white border border-gray-200 rounded-xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{form.title || 'Untitled'}</h1>
          {form.summary && (
            <p className="text-gray-600 mb-6 italic">{form.summary}</p>
          )}
          <DocsMarkdown content={form.content || '*No content yet*'} />
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
