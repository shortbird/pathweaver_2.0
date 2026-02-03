import React, { useState, useEffect, useMemo } from 'react'
import { Modal, ModalFooter } from '../../ui/Modal'
import api from '../../../services/api'
import toast from 'react-hot-toast'
import { ArrowPathIcon } from '@heroicons/react/24/outline'

const PromptEditorModal = ({ isOpen, onClose, componentName, initialContent, category, onSave }) => {
  const [content, setContent] = useState(initialContent || '')
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setContent(initialContent || '')
      setShowDiff(false)
    }
  }, [isOpen, initialContent])

  // Calculate stats
  const stats = useMemo(() => {
    const chars = content.length
    const words = content.trim() ? content.trim().split(/\s+/).length : 0
    const lines = content.split('\n').length

    // Find all {variable} patterns
    const variables = [...new Set(content.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) || [])]

    return { chars, words, lines, variables }
  }, [content])

  // Check if content has changed
  const hasChanges = content !== initialContent

  // Validate content before saving
  const validateContent = () => {
    if (!content.trim()) {
      toast.error('Prompt content cannot be empty')
      return false
    }

    // Check for unbalanced braces
    const openBraces = (content.match(/\{/g) || []).length
    const closeBraces = (content.match(/\}/g) || []).length
    if (openBraces !== closeBraces) {
      toast.error('Unbalanced braces detected in prompt')
      return false
    }

    return true
  }

  const handleSave = async () => {
    if (!validateContent()) return

    setSaving(true)
    try {
      const response = await api.put(`/api/admin/ai/prompts/components/${componentName}`, {
        content,
        category
      })

      toast.success('Prompt updated successfully')
      if (onSave) {
        onSave(response.data)
      }
      onClose()
    } catch (error) {
      console.error('Error saving prompt:', error)
      toast.error(error.response?.data?.error || 'Failed to save prompt')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Reset this prompt to default? This cannot be undone.')) {
      return
    }

    setResetting(true)
    try {
      const response = await api.post(`/api/admin/ai/prompts/components/${componentName}/reset`, {})

      setContent(response.data.content)
      toast.success('Prompt reset to default')
      if (onSave) {
        onSave(response.data)
      }
    } catch (error) {
      console.error('Error resetting prompt:', error)
      toast.error(error.response?.data?.error || 'Failed to reset prompt')
    } finally {
      setResetting(false)
    }
  }

  const handleCancel = () => {
    if (hasChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        return
      }
    }
    onClose()
  }

  // Render diff view (simple line-by-line comparison)
  const renderDiff = () => {
    const originalLines = (initialContent || '').split('\n')
    const currentLines = content.split('\n')
    const maxLines = Math.max(originalLines.length, currentLines.length)

    const diffLines = []
    for (let i = 0; i < maxLines; i++) {
      const orig = originalLines[i] || ''
      const curr = currentLines[i] || ''

      if (orig !== curr) {
        diffLines.push(
          <div key={i} className="mb-2">
            {orig && (
              <div className="bg-red-50 border-l-4 border-red-400 p-2 mb-1">
                <span className="text-red-600 font-mono text-xs">- {orig}</span>
              </div>
            )}
            {curr && (
              <div className="bg-green-50 border-l-4 border-green-400 p-2">
                <span className="text-green-600 font-mono text-xs">+ {curr}</span>
              </div>
            )}
          </div>
        )
      }
    }

    return diffLines.length > 0 ? diffLines : (
      <p className="text-gray-500 italic">No changes detected</p>
    )
  }

  // Highlight {variables} in textarea
  const highlightVariables = (text) => {
    return text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match) => {
      return `<span class="bg-yellow-100 text-purple-700 font-semibold">${match}</span>`
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title={`Edit Prompt: ${componentName}`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Category badge */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Category:</span>
          <span className="px-3 py-1 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full text-xs font-semibold">
            {category}
          </span>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
          <div>
            <span className="font-semibold">{stats.chars}</span> characters
          </div>
          <div>
            <span className="font-semibold">{stats.words}</span> words
          </div>
          <div>
            <span className="font-semibold">{stats.lines}</span> lines
          </div>
          <div>
            <span className="font-semibold">{stats.variables.length}</span> variables
          </div>
        </div>

        {/* Variables list */}
        {stats.variables.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-blue-800 mb-2">Variables used:</p>
            <div className="flex flex-wrap gap-2">
              {stats.variables.map((v, idx) => (
                <code key={idx} className="px-2 py-1 bg-blue-100 text-blue-900 rounded text-xs">
                  {v}
                </code>
              ))}
            </div>
          </div>
        )}

        {/* View toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowDiff(false)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              !showDiff
                ? 'bg-optio-purple text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Editor
          </button>
          <button
            onClick={() => setShowDiff(true)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              showDiff
                ? 'bg-optio-purple text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            disabled={!hasChanges}
          >
            Diff View {hasChanges && <span className="ml-1 text-xs">(changes)</span>}
          </button>
        </div>

        {/* Editor or Diff view */}
        {!showDiff ? (
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-96 p-4 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              placeholder="Enter prompt content here..."
              spellCheck={false}
            />
          </div>
        ) : (
          <div className="border border-gray-300 rounded-lg p-4 h-96 overflow-y-auto bg-gray-50">
            <h3 className="font-semibold mb-3 text-gray-700">Changes:</h3>
            {renderDiff()}
          </div>
        )}

        {/* Help text */}
        <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
          <p className="font-semibold mb-1">Tips:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Use <code className="bg-gray-200 px-1">{'{variable_name}'}</code> for dynamic values</li>
            <li>Variables will be highlighted automatically</li>
            <li>Content is validated before saving</li>
          </ul>
        </div>
      </div>

      {/* Footer with action buttons */}
      <ModalFooter>
        <button
          onClick={handleReset}
          disabled={resetting || saving}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowPathIcon className="w-4 h-4" />
          {resetting ? 'Resetting...' : 'Reset to Default'}
        </button>
        <div className="flex-1"></div>
        <button
          onClick={handleCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </ModalFooter>
    </Modal>
  )
}

export default PromptEditorModal
