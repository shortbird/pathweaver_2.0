import React, { useState, useEffect, useRef } from 'react'
import { crmAPI } from '../../../services/crmAPI'
import toast from 'react-hot-toast'
import { marked } from 'marked'

const TemplateEditor = ({ template, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    template_key: '',
    name: '',
    subject: '',
    description: '',
    markdown_body: '',
    variables: []
  })
  const [sampleData, setSampleData] = useState({})
  const [previewHtml, setPreviewHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [showVariableModal, setShowVariableModal] = useState(false)
  const debounceTimer = useRef(null)
  const isReadOnly = template?.source === 'yaml'

  // Available variables organized by category
  const availableVariables = {
    'User Info': ['user_name', 'first_name', 'last_name', 'email'],
    'Progress': ['total_xp', 'level', 'streak_days'],
    'Links': ['dashboard_url', 'quests_url', 'profile_url', 'tutor_url', 'connections_url'],
    'Quest Info': ['quest_title', 'xp_earned'],
    'Special': ['confirmation_link', 'reset_link', 'expiry_hours']
  }

  // Configure marked for email-safe HTML
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  })

  useEffect(() => {
    if (template) {
      const templateData = template.template_data || {}

      // Convert existing content to markdown
      let markdownBody = ''

      // First check if markdown_source exists (best option - original markdown)
      if (templateData.markdown_source) {
        markdownBody = templateData.markdown_source
      }
      // Then try HTML to markdown conversion
      else if (templateData.body_html) {
        // Simple HTML to markdown conversion for existing templates
        markdownBody = templateData.body_html
          .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
          .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
          .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
          .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
          .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
          .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '') // Remove remaining tags
          .trim()
      }
      // Finally fallback to paragraphs (YAML format)
      else if (templateData.paragraphs) {
        markdownBody = templateData.paragraphs.join('\n\n')
      }

      setFormData({
        template_key: template.template_key,
        name: template.name,
        subject: template.subject,
        description: template.description || '',
        markdown_body: markdownBody,
        variables: templateData.variables || template.variables || []
      })

      // Initialize sample data
      const initialSampleData = {}
      const vars = templateData.variables || template.variables || []
      vars.forEach(v => {
        initialSampleData[v] = ''
      })
      setSampleData(initialSampleData)

      // Generate initial preview
      if (markdownBody) {
        generatePreview(markdownBody, template.subject, initialSampleData)
      }
    }
  }, [template])

  // Debounced preview generation (removed template_key dependency)
  useEffect(() => {
    if (formData.markdown_body) {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }

      debounceTimer.current = setTimeout(() => {
        generatePreview(formData.markdown_body, formData.subject, sampleData)
      }, 500) // 500ms debounce

      return () => {
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current)
        }
      }
    } else {
      // Clear preview if markdown body is empty
      setPreviewHtml('')
    }
  }, [formData.markdown_body, formData.subject, sampleData])

  const generatePreview = async (markdownBody, subject, variables) => {
    if (!markdownBody || markdownBody.trim() === '') {
      setPreviewHtml('')
      return
    }

    try {
      setPreviewLoading(true)

      // Convert markdown to HTML
      const htmlBody = marked.parse(markdownBody)

      // Substitute variables in the HTML using sample data
      let substitutedHtml = htmlBody
      Object.keys(variables).forEach(varName => {
        const value = variables[varName] || `{${varName}}`
        const regex = new RegExp(`\\{${varName}\\}`, 'g')
        substitutedHtml = substitutedHtml.replace(regex, value)
      })

      // Create a simple HTML wrapper for preview without backend call
      // This mimics what the backend wrapper will look like
      const previewHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; background: #f5f5f5; }
            .email-container { background: white; }
            .header { padding: 40px 30px; text-align: center; background: white; border-bottom: 1px solid #e5e5e5; }
            .logo-image { max-width: 200px; }
            .content { padding: 40px 30px; }
            h1 { font-size: 28px; font-weight: 700; color: #2d3748; margin: 0 0 20px 0; }
            h2 { font-size: 22px; font-weight: 700; color: #2d3748; margin: 24px 0 16px 0; }
            h3 { font-size: 18px; font-weight: 600; color: #2d3748; margin: 20px 0 12px 0; }
            p { font-size: 16px; color: #3B383C; margin: 0 0 16px 0; line-height: 1.8; }
            strong { font-weight: 600; color: #2d3748; }
            em { font-style: italic; }
            a { color: #6D469B; text-decoration: none; font-weight: 600; }
            a:hover { color: #5A3A82; text-decoration: underline; }
            ul, ol { margin: 16px 0; padding-left: 24px; }
            li { margin: 8px 0; color: #3B383C; line-height: 1.8; }
            code { background: #f8f7ff; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 14px; }
            pre { background: #f8f7ff; padding: 16px; border-radius: 8px; overflow-x: auto; }
            blockquote { border-left: 4px solid #6D469B; padding-left: 16px; margin: 20px 0; color: #605C61; font-style: italic; }
            .footer { background: #f8f7ff; padding: 30px; text-align: center; border-top: 1px solid #e5e5e5; }
            .footer-text { font-size: 12px; color: #999; line-height: 1.6; margin: 8px 0; }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <img src="https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/email/optio-logo.png" alt="Optio" class="logo-image" width="200" />
            </div>
            <div class="content">
              ${substitutedHtml}
              <p style="margin-top: 32px;">
                Best regards,<br>
                The Optio Team
              </p>
            </div>
            <div class="footer">
              <p class="footer-text">This email was sent from Optio Education</p>
              <p class="footer-text">
                <a href="https://www.optioeducation.com">www.optioeducation.com</a> |
                <a href="mailto:support@optioeducation.com">support@optioeducation.com</a>
              </p>
              <p class="footer-text">© 2025 Optio Education. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `

      setPreviewHtml(previewHtml)
    } catch (error) {
      console.error('Preview generation error:', error)
      setPreviewHtml('<div style="color: red; padding: 20px;">Error generating preview</div>')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleSave = async () => {
    if (!formData.template_key || !formData.name || !formData.subject || !formData.markdown_body) {
      toast.error('Please fill in all required fields (key, name, subject, body)')
      return
    }

    try {
      setLoading(true)

      // Convert markdown to HTML for storage
      const htmlBody = marked.parse(formData.markdown_body)

      const saveData = {
        template_key: formData.template_key,
        name: formData.name,
        subject: formData.subject,
        description: formData.description,
        template_data: {
          body_html: htmlBody,
          markdown_source: formData.markdown_body, // Store original markdown
          variables: formData.variables
        }
      }

      if (template) {
        await crmAPI.updateTemplate(template.template_key, saveData)
        toast.success('Template updated!')
      } else {
        await crmAPI.createTemplate(saveData)
        toast.success('Template created!')
      }
      onSave()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save template')
    } finally {
      setLoading(false)
    }
  }

  const addVariable = (varName) => {
    if (varName && !formData.variables.includes(varName)) {
      setFormData(prev => ({
        ...prev,
        variables: [...prev.variables, varName]
      }))
      setSampleData(prev => ({ ...prev, [varName]: '' }))
      setShowVariableModal(false)
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

  const insertVariable = (varName) => {
    const textarea = document.getElementById('markdown-editor')
    const cursorPos = textarea.selectionStart
    const textBefore = formData.markdown_body.substring(0, cursorPos)
    const textAfter = formData.markdown_body.substring(cursorPos)

    const newText = textBefore + `{${varName}}` + textAfter
    setFormData(prev => ({ ...prev, markdown_body: newText }))

    // Set cursor position after inserted variable
    setTimeout(() => {
      textarea.focus()
      textarea.selectionStart = cursorPos + varName.length + 2
      textarea.selectionEnd = cursorPos + varName.length + 2
    }, 0)
  }

  return (
    <div className="bg-white rounded-lg shadow-lg h-[90vh] flex flex-col">
      {/* Header */}
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

      {/* Content - Flex container */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Top: Metadata fields */}
        <div className="p-6 border-b bg-gray-50 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Template Key <span className="text-red-500">*</span>
              </label>
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Template Name <span className="text-red-500">*</span>
              </label>
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
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Subject Line <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                disabled={isReadOnly}
                placeholder="e.g., Welcome to Optio!"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple disabled:bg-gray-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Description (Optional)</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              disabled={isReadOnly}
              placeholder="Brief description of this template"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple disabled:bg-gray-100"
            />
          </div>
        </div>

        {/* Main: Two-column layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x">
          {/* Left: Markdown Editor */}
          <div className="flex flex-col overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold">Markdown Editor</h3>
                <div className="flex gap-2">
                  {!isReadOnly && (
                    <button
                      onClick={() => setShowVariableModal(true)}
                      className="text-sm px-3 py-1 bg-optio-purple text-white rounded hover:bg-optio-purple-dark"
                    >
                      + Add Variable
                    </button>
                  )}
                </div>
              </div>

              {/* Variables chips */}
              {formData.variables.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {formData.variables.map(v => (
                    <div key={v} className="flex items-center gap-1">
                      <button
                        onClick={() => insertVariable(v)}
                        disabled={isReadOnly}
                        className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-mono hover:bg-purple-200 disabled:opacity-50"
                      >
                        {`{${v}}`}
                      </button>
                      {!isReadOnly && (
                        <button
                          onClick={() => removeVariable(v)}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Markdown cheatsheet */}
              <div className="text-xs text-gray-600 space-y-1">
                <p className="font-semibold">Markdown Quick Reference:</p>
                <div className="grid grid-cols-2 gap-x-4">
                  <p>**bold** → <strong>bold</strong></p>
                  <p>*italic* → <em>italic</em></p>
                  <p># Heading 1</p>
                  <p>## Heading 2</p>
                  <p>- List item</p>
                  <p>[Link](url)</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-4">
              <textarea
                id="markdown-editor"
                value={formData.markdown_body}
                onChange={(e) => setFormData(prev => ({ ...prev, markdown_body: e.target.value }))}
                disabled={isReadOnly}
                placeholder="Write your email content in markdown...

Example:
# Welcome to Optio, {user_name}!

We're excited to have you join our learning community.

## Getting Started

Here are your next steps:
- Complete your profile
- Explore available quests
- Start your first learning journey

**Ready to begin?** Click the button below to view your dashboard."
                className="w-full h-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-optio-purple font-mono text-sm resize-none disabled:bg-gray-100"
              />
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="flex flex-col overflow-hidden bg-gray-50">
            <div className="p-4 border-b bg-gradient-to-r from-optio-purple to-optio-pink">
              <h3 className="text-lg font-bold text-white">Live Preview</h3>
              <p className="text-xs text-white opacity-90">Updates automatically as you type</p>
            </div>

            {/* Sample data inputs */}
            {formData.variables.length > 0 && (
              <div className="p-4 border-b bg-white space-y-2">
                <p className="text-sm font-semibold text-gray-700 mb-2">Test with Sample Data:</p>
                {formData.variables.map(v => (
                  <div key={v} className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-600 w-32">{v}:</label>
                    <input
                      type="text"
                      value={sampleData[v] || ''}
                      onChange={(e) => setSampleData(prev => ({ ...prev, [v]: e.target.value }))}
                      placeholder={`Sample ${v}...`}
                      className="flex-1 px-3 py-1 border rounded text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Preview iframe */}
            <div className="flex-1 overflow-auto p-4">
              {previewLoading && (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
                </div>
              )}

              {!previewLoading && previewHtml && (
                <div className="w-full overflow-x-hidden">
                  <iframe
                    title="Email Preview"
                    srcDoc={previewHtml}
                    className="w-full h-[600px] border-0 bg-white rounded-lg shadow-sm"
                    sandbox="allow-same-origin"
                  />
                </div>
              )}

              {!previewLoading && !formData.markdown_body && (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  Start typing in the editor to see a live preview...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
        <button
          onClick={onClose}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-white font-semibold"
        >
          {isReadOnly ? 'Close' : 'Cancel'}
        </button>
        {!isReadOnly && (
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-semibold"
          >
            {loading ? 'Saving...' : 'Save Template'}
          </button>
        )}
      </div>

      {/* Variable Selector Modal */}
      {showVariableModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b bg-gradient-to-r from-optio-purple to-optio-pink">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Select a Variable</h3>
                <button
                  onClick={() => setShowVariableModal(false)}
                  className="text-white hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-white opacity-90 mt-2">
                Click a variable to add it to your template
              </p>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {Object.entries(availableVariables).map(([category, vars]) => (
                  <div key={category}>
                    <h4 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">
                      {category}
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {vars.map(varName => {
                        const isAlreadyAdded = formData.variables.includes(varName)
                        return (
                          <button
                            key={varName}
                            onClick={() => addVariable(varName)}
                            disabled={isAlreadyAdded}
                            className={`p-3 rounded-lg border-2 text-left transition-all ${
                              isAlreadyAdded
                                ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                                : 'border-purple-200 hover:border-optio-purple hover:bg-purple-50 cursor-pointer'
                            }`}
                          >
                            <div className="font-mono text-sm font-semibold text-optio-purple">
                              {`{${varName}}`}
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              {isAlreadyAdded ? 'Already added' : 'Click to add'}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowVariableModal(false)}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-white font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TemplateEditor
