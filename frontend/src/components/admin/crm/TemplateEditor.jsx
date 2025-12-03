import React, { useState, useEffect } from 'react'
import { crmAPI } from '../../../services/crmAPI'
import toast from 'react-hot-toast'

const TemplateEditor = ({ template, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    template_key: '',
    name: '',
    subject: '',
    body_html: '',
    body_text: '',
    variables: []
  })
  const [previewHtml, setPreviewHtml] = useState('')
  const [sampleData, setSampleData] = useState({})
  const [loading, setLoading] = useState(false)
  const isReadOnly = false  // Allow editing all templates (creates override for system templates)

  useEffect(() => {
    if (template) {
      setFormData({
        template_key: template.template_key,
        name: template.name,
        subject: template.subject,
        body_html: template.body_html || '',
        body_text: template.body_text || '',
        variables: template.variables || []
      })
      // Initialize sample data with empty values
      const initialSampleData = {}
      template.variables?.forEach(v => {
        initialSampleData[v] = ''
      })
      setSampleData(initialSampleData)
    }
  }, [template])

  const handlePreview = async () => {
    try {
      setLoading(true)
      const response = await crmAPI.previewTemplate(formData.template_key, sampleData)
      setPreviewHtml(response.data.html)
    } catch (error) {
      toast.error('Failed to generate preview')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!formData.template_key || !formData.name || !formData.subject) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      setLoading(true)
      if (template) {
        await crmAPI.updateTemplate(template.template_key, formData)
        toast.success('Template updated!')
      } else {
        await crmAPI.createTemplate(formData)
        toast.success('Template created!')
      }
      onSave()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save template')
    } finally {
      setLoading(false)
    }
  }

  const addVariable = () => {
    const varName = prompt('Enter variable name (without curly braces):')
    if (varName && !formData.variables.includes(varName)) {
      setFormData(prev => ({
        ...prev,
        variables: [...prev.variables, varName]
      }))
      setSampleData(prev => ({ ...prev, [varName]: '' }))
    }
  }

  const removeVariable = (varName) => {
    setFormData(prev => ({
      ...prev,
      variables: prev.variables.filter(v => v !== varName)
    }))
    setSampleData(prev => {
      const newData = { ...prev }
      delete newData[varName]
      return newData
    })
  }

  return (
    <div className="bg-white rounded-lg shadow-lg">
      <div className="flex justify-between items-center p-6 border-b">
        <div>
          <h2 className="text-2xl font-bold">
            {isReadOnly ? 'View Template' : template ? 'Edit Template' : 'Create Template'}
          </h2>
          {isReadOnly && (
            <p className="text-sm text-yellow-600 mt-1">
              System templates are read-only. Edit email_copy.yaml to modify.
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6 p-6">
        {/* Left: Editor */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Template Key</label>
            <input
              type="text"
              value={formData.template_key}
              onChange={(e) => setFormData(prev => ({ ...prev, template_key: e.target.value }))}
              disabled={isReadOnly || template}
              placeholder="e.g., welcome_email"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Template Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              disabled={isReadOnly}
              placeholder="e.g., Welcome Email"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Subject Line</label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
              disabled={isReadOnly}
              placeholder="e.g., Welcome to Optio!"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple disabled:bg-gray-100"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-gray-700">Variables</label>
              {!isReadOnly && (
                <button
                  onClick={addVariable}
                  className="text-sm text-optio-purple hover:text-optio-purple-dark font-semibold"
                >
                  + Add Variable
                </button>
              )}
            </div>
            <div className="space-y-2">
              {formData.variables.map(v => (
                <div key={v} className="flex items-center gap-2">
                  <span className="px-3 py-2 bg-gray-100 rounded font-mono text-sm flex-1">
                    {`{${v}}`}
                  </span>
                  {!isReadOnly && (
                    <button
                      onClick={() => removeVariable(v)}
                      className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">HTML Body</label>
            <textarea
              value={formData.body_html}
              onChange={(e) => setFormData(prev => ({ ...prev, body_html: e.target.value }))}
              disabled={isReadOnly}
              placeholder="<h1>Welcome!</h1><p>Thanks for joining {user_name}!</p>"
              rows={10}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple font-mono text-sm disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Plain Text Body</label>
            <textarea
              value={formData.body_text}
              onChange={(e) => setFormData(prev => ({ ...prev, body_text: e.target.value }))}
              disabled={isReadOnly}
              placeholder="Welcome! Thanks for joining {user_name}!"
              rows={6}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple font-mono text-sm disabled:bg-gray-100"
            />
          </div>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-bold mb-3">Preview</h3>
            <div className="space-y-2 mb-4">
              {formData.variables.map(v => (
                <div key={v}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{v}</label>
                  <input
                    type="text"
                    value={sampleData[v] || ''}
                    onChange={(e) => setSampleData(prev => ({ ...prev, [v]: e.target.value }))}
                    placeholder={`Sample ${v}...`}
                    className="w-full px-3 py-1 border rounded text-sm"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handlePreview}
              disabled={loading || !formData.template_key}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 mb-4"
            >
              {loading ? 'Generating...' : 'Generate Preview'}
            </button>

            {previewHtml && (
              <div className="border rounded-lg overflow-hidden bg-white">
                <div className="bg-gray-100 px-4 py-2 border-b">
                  <p className="text-xs font-semibold text-gray-600">Email Preview</p>
                </div>
                <div
                  className="p-4 overflow-auto max-h-96"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
        <button
          onClick={onClose}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-white"
        >
          {isReadOnly ? 'Close' : 'Cancel'}
        </button>
        {!isReadOnly && (
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Template'}
          </button>
        )}
      </div>
    </div>
  )
}

export default TemplateEditor
