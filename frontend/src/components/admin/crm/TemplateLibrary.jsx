import React, { useState, useEffect } from 'react'
import { crmAPI } from '../../../services/crmAPI'
import toast from 'react-hot-toast'
import TemplateEditor from './TemplateEditor'

const TemplateLibrary = () => {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showEditor, setShowEditor] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const response = await crmAPI.getTemplates(true)
      setTemplates(response.data.templates || [])
    } catch (error) {
      toast.error('Failed to load templates')
      console.error(error)
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }

  const handleSyncFromYAML = async () => {
    const confirmed = window.confirm(
      'Sync all templates from email_copy.yaml? This will update existing templates in the database.'
    )
    if (!confirmed) return

    try {
      setSyncing(true)
      const response = await crmAPI.syncTemplates([])
      toast.success(`Synced ${response.data.synced} templates from YAML!`)
      fetchTemplates()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to sync templates')
    } finally {
      setSyncing(false)
    }
  }

  const handleDeleteTemplate = async (template) => {
    if (template.source === 'yaml') {
      toast.error('Cannot delete system templates. Edit email_copy.yaml instead.')
      return
    }

    const confirmed = window.confirm(`Delete template "${template.name}"? This cannot be undone.`)
    if (!confirmed) return

    try {
      await crmAPI.deleteTemplate(template.template_key)
      toast.success('Template deleted')
      fetchTemplates()
    } catch (error) {
      toast.error('Failed to delete template')
    }
  }

  const filteredTemplates = templates.filter(t => {
    if (filter === 'system') return t.source === 'yaml'
    if (filter === 'custom') return t.source === 'custom'
    return true
  })

  if (showEditor) {
    return (
      <TemplateEditor
        template={editingTemplate}
        onClose={() => {
          setShowEditor(false)
          setEditingTemplate(null)
        }}
        onSave={() => {
          setShowEditor(false)
          setEditingTemplate(null)
          fetchTemplates()
        }}
      />
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Email Templates</h2>
          <p className="text-sm text-gray-600 mt-1">Manage email templates for campaigns</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSyncFromYAML}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Import from YAML'}
          </button>
          <button
            onClick={() => setShowEditor(true)}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90"
          >
            Create Template
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {['all', 'system', 'custom'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`pb-2 px-4 font-semibold text-sm ${
              filter === f
                ? 'border-b-2 border-optio-purple text-optio-purple'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No templates found. Create your first template or import from YAML!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map(template => (
            <div key={template.template_key} className="bg-white border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-lg">{template.name}</h3>
                  {template.source === 'yaml' && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                      System
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-3">{template.subject}</p>
                <p className="text-xs text-gray-500 mb-3">
                  <span className="font-semibold">Key:</span> {template.template_key}
                </p>

                {/* Variables preview */}
                {template.variables && template.variables.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-1">Variables:</p>
                    <div className="flex flex-wrap gap-1">
                      {template.variables.map(v => (
                        <span key={v} className="px-2 py-1 bg-gray-100 text-xs rounded font-mono">
                          {`{${v}}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex border-t bg-gray-50">
                <button
                  onClick={() => {
                    setEditingTemplate(template)
                    setShowEditor(true)
                  }}
                  className="flex-1 py-2 text-sm text-optio-purple hover:bg-gray-100 font-semibold"
                >
                  {template.source === 'yaml' ? 'View' : 'Edit'}
                </button>
                {template.source === 'custom' && (
                  <button
                    onClick={() => handleDeleteTemplate(template)}
                    className="flex-1 py-2 text-sm text-red-600 hover:bg-gray-100 font-semibold border-l"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TemplateLibrary
