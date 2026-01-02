import React, { useState } from 'react'
import api from '../../../services/api'
import toast from 'react-hot-toast'
import { ChevronDownIcon, ChevronUpIcon, ClipboardDocumentIcon, BeakerIcon } from '@heroicons/react/24/outline'

const PromptPreviewPanel = ({ promptContent, sampleContext = {} }) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const assemblePrompt = () => {
    if (!promptContent) return ''

    let assembled = promptContent

    // Replace placeholders with sample context values
    Object.keys(sampleContext).forEach(key => {
      const placeholder = `{${key}}`
      assembled = assembled.replace(new RegExp(placeholder, 'g'), sampleContext[key])
    })

    return assembled
  }

  const handleCopy = async () => {
    try {
      const assembled = assemblePrompt()
      await navigator.clipboard.writeText(assembled)
      toast.success('Prompt copied to clipboard')
    } catch (error) {
      toast.error('Failed to copy prompt')
    }
  }

  const handleTest = async () => {
    try {
      setTesting(true)
      setTestResult(null)

      const assembled = assemblePrompt()
      const response = await api.post('/api/admin/ai/generate/test', {
        prompt: assembled,
        context: sampleContext
      })

      setTestResult(response.data)
      toast.success('Test generation completed')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Test generation failed')
      setTestResult({
        success: false,
        error: error.response?.data?.error || 'Unknown error'
      })
    } finally {
      setTesting(false)
    }
  }

  const assembled = assemblePrompt()

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              {isExpanded ? (
                <ChevronUpIcon className="w-5 h-5" />
              ) : (
                <ChevronDownIcon className="w-5 h-5" />
              )}
            </button>
            <h3 className="text-sm font-semibold text-gray-900">Prompt Preview</h3>
            <span className="text-xs text-gray-500">
              {assembled.length} characters
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              title="Copy to clipboard"
            >
              <ClipboardDocumentIcon className="w-4 h-4" />
              <span>Copy</span>
            </button>

            <button
              onClick={handleTest}
              disabled={testing || !assembled}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-white bg-optio-purple hover:bg-optio-purple/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Test generation"
            >
              <BeakerIcon className="w-4 h-4" />
              <span>{testing ? 'Testing...' : 'Test'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Assembled Prompt */}
          <div>
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-gray-100 whitespace-pre-wrap font-mono">
                {assembled || 'No prompt content'}
              </pre>
            </div>
          </div>

          {/* Sample Context */}
          {Object.keys(sampleContext).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Sample Context
              </h4>
              <div className="bg-gray-50 rounded-lg p-3 overflow-x-auto">
                <pre className="text-xs text-gray-700 font-mono">
                  {JSON.stringify(sampleContext, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Test Result */}
          {testResult && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Test Result
              </h4>
              {testResult.success === false ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-900 font-medium">Error</p>
                  <p className="text-xs text-red-700 mt-1">{testResult.error}</p>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm text-green-900 font-medium">Success</p>
                  <div className="mt-2 bg-white rounded p-2 overflow-x-auto">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                      {typeof testResult.result === 'string'
                        ? testResult.result
                        : JSON.stringify(testResult.result, null, 2)}
                    </pre>
                  </div>
                  {testResult.usage && (
                    <div className="mt-2 flex items-center space-x-4 text-xs text-green-700">
                      <span>Tokens: {testResult.usage.total_tokens || 'N/A'}</span>
                      <span>Time: {testResult.duration || 'N/A'}ms</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PromptPreviewPanel
