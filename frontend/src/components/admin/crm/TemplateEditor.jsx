import React, { useState, useEffect, useCallback, useRef } from 'react'
import { crmAPI } from '../../../services/crmAPI'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'

const TemplateEditor = ({ template, onClose, onSave }) => {
  const [templateKey, setTemplateKey] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [subject, setSubject] = useState('')
  const [markdownContent, setMarkdownContent] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [senderName, setSenderName] = useState('Optio Support')
  const [signature, setSignature] = useState('tanner')
  const [variables, setVariables] = useState([])
  const [sampleData, setSampleData] = useState({})
  const [previewHtml, setPreviewHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoPreview, setAutoPreview] = useState(true)
  const textareaRef = useRef(null)

  // Get sample value for common variables
  const getSampleValue = useCallback((varName) => {
    const samples = {
      parent_name: 'Sarah Johnson',
      user_name: 'Alex Smith',
      teen_age_text: ' (age 15)',
      activity_text: " We're excited to hear about your interest in homeschooling.",
      email: 'parent@example.com',
      current_curriculum: 'Time4Learning',
      phone: '(555) 123-4567',
      goals: 'Prepare for college while maintaining flexibility'
    }
    return samples[varName] || `[${varName}]`
  }, [])

  // Extract variables from text ({{ variable_name }})
  const extractVariables = useCallback((text) => {
    const regex = /\{\{\s*(\w+)\s*\}\}/g
    const matches = [...text.matchAll(regex)]
    const uniqueVars = [...new Set(matches.map(m => m[1]))]
    setVariables(uniqueVars)

    // Initialize sample data for preview - preserve existing values if user has edited them
    setSampleData(prevData => {
      const newData = {}
      uniqueVars.forEach(v => {
        // Keep user's custom value if it exists, otherwise use default sample
        newData[v] = prevData[v] || getSampleValue(v)
      })
      return newData
    })
  }, [getSampleValue])

  // Convert template_data to markdown on load
  useEffect(() => {
    if (template) {
      setTemplateKey(template.template_key || template.key)
      setTemplateName(template.name)
      setSubject(template.subject)

      // Convert template_data to markdown
      const data = template.template_data || template.data || {}
      let markdown = ''

      // Salutation/Greeting
      if (data.salutation) {
        markdown += `${data.salutation}\n\n`
      } else if (data.greeting) {
        markdown += `${data.greeting}\n\n`
      }

      // Paragraphs
      if (data.paragraphs && Array.isArray(data.paragraphs)) {
        markdown += data.paragraphs.join('\n\n') + '\n\n'
      }

      // Highlight box
      if (data.highlight_box) {
        markdown += `---\n`
        markdown += `**${data.highlight_box.title}**\n\n`
        if (data.highlight_box.content) {
          markdown += `${data.highlight_box.content}\n\n`
        }
        if (data.highlight_box.bullet_points) {
          data.highlight_box.bullet_points.forEach(point => {
            markdown += `- ${point}\n`
          })
          markdown += '\n'
        }
        markdown += `---\n\n`
      }

      // Closing paragraphs
      if (data.closing_paragraphs && Array.isArray(data.closing_paragraphs)) {
        markdown += data.closing_paragraphs.join('\n\n') + '\n\n'
      }

      setMarkdownContent(markdown.trim())

      // CTA
      if (data.cta) {
        setCtaText(data.cta.text || '')
        setCtaUrl(data.cta.url || '')
      }

      // Sender Name
      if (data.sender_name) {
        setSenderName(data.sender_name)
      }

      // Signature
      if (data.signature) {
        setSignature(data.signature)
      }

      // Extract variables from markdown and subject
      extractVariables(markdown + ' ' + (template.subject || ''))
    }
  }, [template, extractVariables])

  // Auto-update variables when markdown or subject changes
  useEffect(() => {
    extractVariables(markdownContent + ' ' + subject)
  }, [markdownContent, subject, extractVariables])

  // Auto-preview when content changes
  useEffect(() => {
    if (autoPreview && templateKey && markdownContent) {
      const timer = setTimeout(() => {
        handlePreview()
      }, 1000) // Debounce 1 second
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdownContent, subject, ctaText, ctaUrl, senderName, signature, sampleData, autoPreview, templateKey])

  const handlePreview = async () => {
    if (!templateKey) return

    try {
      setLoading(true)

      // Convert markdown to template_data structure
      const templateData = convertMarkdownToTemplateData()

      console.log('🔍 Preview Debug:', {
        templateKey,
        subject,
        templateData,
        sampleData,
        sampleDataKeys: Object.keys(sampleData),
        sampleDataValues: Object.values(sampleData),
        markdownLength: markdownContent.length
      })
      console.log('📊 Full Sample Data:', JSON.stringify(sampleData, null, 2))

      // Call preview API
      const response = await crmAPI.previewTemplate(templateKey, {
        subject,
        template_data: templateData,
        sample_data: sampleData
      })

      console.log('✅ Preview Response:', {
        hasHtml: !!response.data.html,
        htmlLength: (response.data.html || '').length
      })

      setPreviewHtml(response.data.html || '')
    } catch (error) {
      console.error('❌ Preview error:', error)
      console.error('Error response:', error.response?.data)
      // Don't show error toast for auto-preview
      if (!autoPreview) {
        toast.error('Failed to generate preview')
      }
    } finally {
      setLoading(false)
    }
  }

  const convertMarkdownToTemplateData = () => {
    const lines = markdownContent.split('\n')
    const templateData = {
      paragraphs: [],
      closing_paragraphs: [],
      cta: {},
      sender_name: senderName,
      signature
    }

    let currentSection = 'paragraphs'
    let highlightBox = null
    let currentParagraph = ''

    lines.forEach(line => {
      const trimmed = line.trim()

      // Check for horizontal rule (highlight box delimiter)
      if (trimmed === '---') {
        if (currentSection === 'paragraphs') {
          // Save current paragraph before starting highlight box
          if (currentParagraph) {
            templateData.paragraphs.push(currentParagraph.trim())
            currentParagraph = ''
          }
          currentSection = 'highlight'
          highlightBox = { bullet_points: [] }
        } else if (currentSection === 'highlight') {
          // End highlight box, switch to closing paragraphs
          if (highlightBox) {
            templateData.highlight_box = highlightBox
          }
          currentSection = 'closing'
          highlightBox = null
        }
        return
      }

      // Handle highlight box content
      if (currentSection === 'highlight') {
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
          // Highlight box title
          highlightBox.title = trimmed.slice(2, -2)
        } else if (trimmed.startsWith('- ')) {
          // Bullet point
          highlightBox.bullet_points.push(trimmed.slice(2))
        } else if (trimmed) {
          // Content
          if (!highlightBox.content) {
            highlightBox.content = trimmed
          } else {
            highlightBox.content += ' ' + trimmed
          }
        }
        return
      }

      // Regular paragraphs
      if (trimmed === '') {
        if (currentParagraph) {
          if (currentSection === 'closing') {
            templateData.closing_paragraphs.push(currentParagraph.trim())
          } else {
            templateData.paragraphs.push(currentParagraph.trim())
          }
          currentParagraph = ''
        }
      } else {
        if (currentParagraph) {
          currentParagraph += ' ' + trimmed
        } else {
          currentParagraph = trimmed
        }
      }
    })

    // Add last paragraph
    if (currentParagraph) {
      if (currentSection === 'closing') {
        templateData.closing_paragraphs.push(currentParagraph.trim())
      } else {
        templateData.paragraphs.push(currentParagraph.trim())
      }
    }

    // Add salutation (first paragraph if it looks like a greeting)
    if (templateData.paragraphs.length > 0) {
      const firstPara = templateData.paragraphs[0]
      if (firstPara.match(/^(Hi|Hello|Dear|Hey|Greetings)/i)) {
        templateData.salutation = templateData.paragraphs.shift()
      }
    }

    // Add CTA
    if (ctaText && ctaUrl) {
      templateData.cta = {
        text: ctaText,
        url: ctaUrl
      }
    }

    return templateData
  }

  const handleSave = async () => {
    if (!templateKey || !templateName || !subject) {
      toast.error('Please fill in template key, name, and subject')
      return
    }

    try {
      setLoading(true)

      const templateData = convertMarkdownToTemplateData()

      const payload = {
        template_key: templateKey,
        name: templateName,
        subject,
        template_data: templateData
      }

      if (template) {
        await crmAPI.updateTemplate(template.template_key || template.key, payload)
        toast.success('Template updated!')
      } else {
        await crmAPI.createTemplate(payload)
        toast.success('Template created!')
      }

      onSave()
    } catch (error) {
      console.error('Save error:', error)
      toast.error(error.response?.data?.error || 'Failed to save template')
    } finally {
      setLoading(false)
    }
  }

  const insertVariable = (varName) => {
    const variable = `{{ ${varName} }}`
    const textarea = textareaRef.current

    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const text = markdownContent
      const before = text.substring(0, start)
      const after = text.substring(end)

      setMarkdownContent(before + variable + after)

      // Set cursor position after inserted variable
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + variable.length, start + variable.length)
      }, 0)
    } else {
      // Fallback: append to end
      setMarkdownContent(prev => prev + variable)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b bg-gradient-to-r from-optio-purple to-optio-pink text-white">
          <div>
            <h2 className="text-2xl font-bold">
              {template ? 'Edit Email Template' : 'Create Email Template'}
            </h2>
            <p className="text-sm opacity-90 mt-1">
              Write in markdown, preview in real-time
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left: Editor */}
          <div className="w-1/2 border-r overflow-y-auto p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Template Key</label>
              <input
                type="text"
                value={templateKey}
                onChange={(e) => setTemplateKey(e.target.value)}
                disabled={!!template}
                placeholder="e.g., promo_welcome"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Template Name</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Promo Welcome Email"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Subject Line</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Welcome to Optio!"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-gray-700">Email Body (Markdown)</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Variables detected: {variables.length}</span>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        insertVariable(e.target.value)
                        e.target.value = ''
                      }
                    }}
                    className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50"
                  >
                    <option value="">+ Insert Variable</option>
                    <option value="parent_name">parent_name</option>
                    <option value="user_name">user_name</option>
                    <option value="teen_age_text">teen_age_text</option>
                    <option value="activity_text">activity_text</option>
                    <option value="email">email</option>
                    <option value="current_curriculum">current_curriculum</option>
                    <option value="phone">phone</option>
                    <option value="goals">goals</option>
                    <option value="first_name">first_name</option>
                    <option value="last_name">last_name</option>
                    <option value="total_xp">total_xp</option>
                    <option value="quest_title">quest_title</option>
                    <option value="xp_earned">xp_earned</option>
                    <option value="confirmation_link">confirmation_link</option>
                    <option value="reset_link">reset_link</option>
                    <option value="expiry_hours">expiry_hours</option>
                  </select>
                </div>
              </div>
              <textarea
                ref={textareaRef}
                value={markdownContent}
                onChange={(e) => setMarkdownContent(e.target.value)}
                placeholder="Hi {{ parent_name }},

Thank you for your interest in Optio...

---
**Want to learn more?**

- Point 1
- Point 2
---

Looking forward to connecting!"
                rows={15}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple font-mono text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Use <code className="bg-gray-100 px-1 rounded">{`{{ variable_name }}`}</code> for variables.
                Use <code className="bg-gray-100 px-1 rounded">---</code> for highlight boxes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">CTA Button Text</label>
                <input
                  type="text"
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  placeholder="e.g., Explore Our Demo"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">CTA Button URL</label>
                <input
                  type="text"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://www.optioeducation.com/demo"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Sender Name (Email Preview)</label>
              <select
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
              >
                <option value="Optio Support">Optio Support</option>
                <option value="Tanner with Optio">Tanner with Optio</option>
                <option value="The Optio Team">The Optio Team</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">This is the name shown in the email "From" field</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Signature</label>
              <select
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-optio-purple"
              >
                <option value="tanner">Dr. Tanner Bowman (Founder)</option>
                <option value="support">Optio Support</option>
                <option value="team">The Optio Team</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">This is the signature at the bottom of the email</p>
            </div>

            {/* Variables detected */}
            {variables.length > 0 && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Detected Variables</label>
                <div className="flex flex-wrap gap-2">
                  {variables.map(v => (
                    <span key={v} className="px-3 py-1 bg-optio-purple bg-opacity-10 text-optio-purple rounded-full text-sm font-mono">
                      {`{{ ${v} }}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Preview */}
          <div className="w-1/2 overflow-y-auto bg-gray-50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Live Preview</h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoPreview}
                  onChange={(e) => setAutoPreview(e.target.checked)}
                  className="rounded"
                />
                Auto-preview
              </label>
            </div>

            {/* Sample data inputs */}
            {variables.length > 0 && (
              <div className="mb-4 space-y-2 bg-white p-4 rounded-lg border">
                <p className="text-xs font-semibold text-gray-600 mb-2">Sample Data for Preview:</p>
                {variables.map(v => (
                  <div key={v} className="flex items-center gap-2">
                    <label className="text-xs font-mono text-gray-600 w-32">{v}:</label>
                    <input
                      type="text"
                      value={sampleData[v] || ''}
                      onChange={(e) => setSampleData(prev => ({ ...prev, [v]: e.target.value }))}
                      placeholder={getSampleValue(v)}
                      className="flex-1 px-2 py-1 border rounded text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {!autoPreview && (
              <button
                onClick={handlePreview}
                disabled={loading || !templateKey}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 mb-4"
              >
                {loading ? 'Generating Preview...' : 'Generate Preview'}
              </button>
            )}

            {/* Email preview */}
            <div className="bg-white rounded-lg shadow-lg border overflow-hidden">
              {/* Email body - exact recipient view */}
              <div
                className="min-h-96 overflow-auto"
                dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-gray-400 text-center py-12">Preview will appear here...</p>' }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {loading && <span className="text-blue-600">Generating preview...</span>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-white font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-semibold"
            >
              {loading ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TemplateEditor
