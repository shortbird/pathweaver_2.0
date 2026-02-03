import React, { useRef, useCallback } from 'react'

/**
 * MarkdownEditor - Clean markdown editor with auto-list features
 */
const MarkdownEditor = ({
  value,
  onChange,
  placeholder = "Enter your curriculum content here..."
}) => {
  const textareaRef = useRef(null)

  // Insert markdown at cursor position
  const insertMarkdown = useCallback((before, after = '') => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = value.substring(start, end)
    const newText = value.substring(0, start) + before + selectedText + after + value.substring(end)
    onChange(newText)

    // Reset cursor position
    setTimeout(() => {
      textarea.focus()
      const newPosition = start + before.length + selectedText.length
      textarea.selectionStart = start + before.length
      textarea.selectionEnd = newPosition
    }, 0)
  }, [value, onChange])

  // Handle keyboard events for auto-list features
  const handleKeyDown = useCallback((e) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const { selectionStart } = textarea
    const textBefore = value.substring(0, selectionStart)
    const textAfter = value.substring(selectionStart)
    const lastNewline = textBefore.lastIndexOf('\n')
    const currentLine = textBefore.substring(lastNewline + 1)

    // Handle Enter key for list continuation
    if (e.key === 'Enter') {
      // Check for bullet list (-, *, +)
      const bulletMatch = currentLine.match(/^(\s*)([-*+])\s(.*)$/)
      if (bulletMatch) {
        const [, indent, bullet, content] = bulletMatch

        // If empty bullet, remove it and exit list
        if (!content.trim()) {
          e.preventDefault()
          const lineStart = lastNewline + 1
          const newText = value.substring(0, lineStart) + '\n' + textAfter
          onChange(newText)
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = lineStart + 1
          }, 0)
          return
        }

        e.preventDefault()
        const newLine = `\n${indent}${bullet} `
        const newText = textBefore + newLine + textAfter
        onChange(newText)
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = selectionStart + newLine.length
        }, 0)
        return
      }

      // Check for numbered list
      const numberMatch = currentLine.match(/^(\s*)(\d+)\.\s(.*)$/)
      if (numberMatch) {
        const [, indent, num, content] = numberMatch

        // If empty item, remove it and exit list
        if (!content.trim()) {
          e.preventDefault()
          const lineStart = lastNewline + 1
          const newText = value.substring(0, lineStart) + '\n' + textAfter
          onChange(newText)
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = lineStart + 1
          }, 0)
          return
        }

        e.preventDefault()
        const nextNum = parseInt(num) + 1
        const newLine = `\n${indent}${nextNum}. `
        const newText = textBefore + newLine + textAfter
        onChange(newText)
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = selectionStart + newLine.length
        }, 0)
        return
      }
    }

    // Handle Tab key for indentation
    if (e.key === 'Tab') {
      const bulletOrNumberMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)\s/)
      if (bulletOrNumberMatch) {
        e.preventDefault()
        const lineStart = lastNewline + 1

        if (e.shiftKey) {
          // Outdent - remove up to 2 spaces
          const spacesToRemove = currentLine.startsWith('  ') ? 2 : (currentLine.startsWith(' ') ? 1 : 0)
          if (spacesToRemove > 0) {
            const newText = value.substring(0, lineStart) + currentLine.substring(spacesToRemove) + textAfter
            onChange(newText)
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = selectionStart - spacesToRemove
            }, 0)
          }
        } else {
          // Indent - add 2 spaces
          const newText = value.substring(0, lineStart) + '  ' + currentLine + textAfter
          onChange(newText)
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = selectionStart + 2
          }, 0)
        }
        return
      }
    }

    // Keyboard shortcuts (Ctrl/Cmd + key)
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault()
          insertMarkdown('**', '**')
          break
        case 'i':
          e.preventDefault()
          insertMarkdown('*', '*')
          break
        case 'k':
          e.preventDefault()
          insertMarkdown('[', '](url)')
          break
      }
    }
  }, [value, onChange, insertMarkdown])

  const toolbarButtons = [
    { label: 'Heading 1', action: () => insertMarkdown('# ', ''), icon: 'H1', className: 'text-lg font-bold' },
    { label: 'Heading 2', action: () => insertMarkdown('## ', ''), icon: 'H2', className: 'text-base font-bold' },
    { label: 'Heading 3', action: () => insertMarkdown('### ', ''), icon: 'H3', className: 'text-sm font-semibold' },
    { label: 'Bold (Ctrl+B)', action: () => insertMarkdown('**', '**'), icon: 'B', className: 'font-bold' },
    { label: 'Italic (Ctrl+I)', action: () => insertMarkdown('*', '*'), icon: 'I', className: 'italic' },
    { label: 'Bullet List', action: () => insertMarkdown('- ', ''), icon: '•', className: 'text-lg' },
    { label: 'Numbered List', action: () => insertMarkdown('1. ', ''), icon: '1.', className: 'text-sm font-medium' },
    { label: 'Link (Ctrl+K)', action: () => insertMarkdown('[', '](url)'), icon: 'Link', className: 'text-optio-purple underline text-sm' },
    { label: 'Code', action: () => insertMarkdown('`', '`'), icon: '</>', className: 'font-mono text-sm' },
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
            className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-100 transition-colors min-w-[36px] h-[30px] flex items-center justify-center"
            title={btn.label}
          >
            <span className={btn.className || 'text-sm font-medium text-gray-700'}>{btn.icon}</span>
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="bg-white">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full p-4 border-0 focus:ring-0 focus:outline-none min-h-[300px] resize-y text-sm font-mono"
          style={{ fontFamily: 'Consolas, Monaco, "Courier New", monospace' }}
        />
      </div>

      {/* Helper Text */}
      <div className="bg-gray-50 border-t border-gray-300 px-4 py-2 text-xs text-gray-600">
        <span>
          <strong>Markdown editor:</strong> Lists auto-continue on Enter, Tab to indent, Shift+Tab to outdent.
          <span className="ml-2 text-gray-500">Ctrl+B bold, Ctrl+I italic, Ctrl+K link</span>
        </span>
      </div>
    </div>
  )
}

export default MarkdownEditor
