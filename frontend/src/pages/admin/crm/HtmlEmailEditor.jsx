import React, { useMemo, useRef } from 'react'
import { TEMPLATE_VARIABLES } from './crmConstants'

/**
 * Substitute sample values for the {{variable}} tokens so the preview shows a
 * realistic email. Whitespace-tolerant: {{ first_name }} also matches.
 */
export const substituteSampleValues = (html) =>
  TEMPLATE_VARIABLES.reduce(
    (acc, variable) =>
      acc.replace(new RegExp(`\\{\\{\\s*${variable.name}\\s*\\}\\}`, 'g'), variable.sample),
    html || ''
  )

/**
 * Raw-HTML email editor: monospace source on the left, sandboxed live preview
 * on the right. Deliberately NOT a rich-text editor - the migrated Brevo
 * templates are inline-styled HTML fragments that TipTap would shred
 * (docs/CRM_REPLACEMENT_PLAN.md, screen 4).
 *
 * Variable chips insert at the cursor using the selectionStart technique from
 * components/curriculum/MarkdownEditor.jsx.
 */
const HtmlEmailEditor = ({ value, onChange }) => {
  const textareaRef = useRef(null)

  const insertVariable = (token) => {
    const textarea = textareaRef.current
    const text = value || ''
    if (!textarea) {
      onChange(text + token)
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    onChange(text.substring(0, start) + token + text.substring(end))
    setTimeout(() => {
      textarea.focus()
      textarea.selectionStart = textarea.selectionEnd = start + token.length
    }, 0)
  }

  const previewHtml = useMemo(() => substituteSampleValues(value), [value])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs text-gray-500">Insert variable:</span>
        {TEMPLATE_VARIABLES.map((variable) => (
          <button
            key={variable.token}
            type="button"
            onClick={() => insertVariable(variable.token)}
            title={variable.label}
            className="px-2 py-1 text-xs font-mono rounded-md bg-optio-purple/10 text-optio-purple hover:bg-optio-purple/20 transition-colors"
          >
            {variable.token}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <textarea
          ref={textareaRef}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={28}
          spellCheck={false}
          aria-label="Email HTML source"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple resize-vertical"
        />
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white flex flex-col">
          <div className="px-3 py-1.5 border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
            Preview (sample values)
          </div>
          <iframe
            sandbox=""
            srcDoc={previewHtml}
            title="Email preview"
            className="w-full flex-1 min-h-[500px] bg-white"
          />
        </div>
      </div>
    </div>
  )
}

export default HtmlEmailEditor
