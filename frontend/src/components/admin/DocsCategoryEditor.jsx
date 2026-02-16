import React, { useState, useEffect } from 'react'
import ModalOverlay from '../ui/ModalOverlay'
import toast from 'react-hot-toast'
import api from '../../services/api'

const DocsCategoryEditor = ({ category, onClose, onSaved }) => {
  const isEditing = !!category
  const [form, setForm] = useState({
    title: '',
    slug: '',
    description: '',
    icon: 'book-open',
    sort_order: 0,
    is_published: true
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (category) {
      setForm({
        title: category.title || '',
        slug: category.slug || '',
        description: category.description || '',
        icon: category.icon || 'book-open',
        sort_order: category.sort_order || 0,
        is_published: category.is_published !== false
      })
    }
  }, [category])

  const handleTitleChange = (e) => {
    const title = e.target.value
    setForm(prev => ({
      ...prev,
      title,
      // Auto-generate slug from title if not editing
      slug: isEditing ? prev.slug : title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
    }))
  }

  const iconOptions = [
    { value: 'book-open', label: 'Book' },
    { value: 'academic-cap', label: 'Academic' },
    { value: 'user-group', label: 'Users' },
    { value: 'building-office', label: 'Building' },
    { value: 'cog-6-tooth', label: 'Settings' },
    { value: 'eye', label: 'Eye' },
    { value: 'rocket-launch', label: 'Rocket' },
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }

    setSaving(true)
    try {
      if (isEditing) {
        await api.put(`/api/admin/docs/categories/${category.id}`, form)
        toast.success('Category updated')
      } else {
        await api.post('/api/admin/docs/categories', form)
        toast.success('Category created')
      }
      onSaved()
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to save category'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6">
          {isEditing ? 'Edit Category' : 'New Category'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={handleTitleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
              placeholder="e.g., Getting Started"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
            <input
              type="text"
              value={form.slug}
              onChange={e => setForm(prev => ({ ...prev, slug: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple font-mono text-sm"
              placeholder="getting-started"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
              rows={2}
              placeholder="Brief description shown on the docs landing page"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
              <select
                value={form.icon}
                onChange={e => setForm(prev => ({ ...prev, icon: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-optio-purple"
              >
                {iconOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
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
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="cat-published"
              checked={form.is_published}
              onChange={e => setForm(prev => ({ ...prev, is_published: e.target.checked }))}
              className="rounded text-optio-purple focus:ring-optio-purple"
            />
            <label htmlFor="cat-published" className="text-sm text-gray-700">Published</label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : (isEditing ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  )
}

export default DocsCategoryEditor
