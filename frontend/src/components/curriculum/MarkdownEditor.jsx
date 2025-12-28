import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'

const MarkdownEditor = ({ value, onChange, placeholder = "Enter your curriculum content here..." }) => {
  const [showPreview, setShowPreview] = useState(false)

  const insertMarkdown = (before, after = '') => {
    const textarea = document.getElementById('markdown-textarea')
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = value.substring(start, end)
    const newText = value.substring(0, start) + before + selectedText + after + value.substring(end)
    onChange(newText)

    // Reset cursor position
    setTimeout(() => {
      textarea.focus()
      textarea.selectionStart = start + before.length
      textarea.selectionEnd = start + before.length + selectedText.length
    }, 0)
  }

  const toolbarButtons = [
    { label: 'H1', action: () => insertMarkdown('# ', ''), icon: 'H1' },
    { label: 'H2', action: () => insertMarkdown('## ', ''), icon: 'H2' },
    { label: 'H3', action: () => insertMarkdown('### ', ''), icon: 'H3' },
    { label: 'Bold', action: () => insertMarkdown('**', '**'), icon: 'B' },
    { label: 'Italic', action: () => insertMarkdown('*', '*'), icon: 'I' },
    { label: 'Bullet List', action: () => insertMarkdown('- ', ''), icon: '•' },
    { label: 'Numbered List', action: () => insertMarkdown('1. ', ''), icon: '1.' },
    { label: 'Link', action: () => insertMarkdown('[', '](url)'), icon: 'Link' },
    { label: 'Code', action: () => insertMarkdown('`', '`'), icon: '<>' },
  ]

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="bg-gray-50 border-b border-gray-300 p-2 flex items-center gap-1 flex-wrap">
        {toolbarButtons.map((btn, idx) => (
          <button
            key={idx}
            type="button"
            onClick={btn.action}
            className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 transition-colors"
            title={btn.label}
          >
            {btn.icon}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              showPreview
                ? 'bg-optio-purple text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
            }`}
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>

      {/* Editor/Preview */}
      <div className="bg-white">
        {showPreview ? (
          <div className="p-4 prose prose-sm max-w-none min-h-[300px]">
            {value ? (
              <ReactMarkdown>{value}</ReactMarkdown>
            ) : (
              <p className="text-gray-400 italic">No content yet. Switch to Edit mode to start writing.</p>
            )}
          </div>
        ) : (
          <textarea
            id="markdown-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full p-4 border-0 focus:ring-0 focus:outline-none min-h-[300px] resize-y font-mono text-sm"
            style={{ fontFamily: 'Consolas, Monaco, "Courier New", monospace' }}
          />
        )}
      </div>

      {/* Helper Text */}
      <div className="bg-gray-50 border-t border-gray-300 px-4 py-2 text-xs text-gray-600">
        Supports Markdown formatting. Use the toolbar above or write markdown directly.
      </div>
    </div>
  )
}

export default MarkdownEditor
