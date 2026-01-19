import React from 'react'
import {
  ClipboardDocumentIcon,
  DocumentTextIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'

/**
 * PromptUpdatePreview - Shows the generated prompt modifier with copy functionality
 *
 * Props:
 * - modifier: { modifier: { title, instruction, applies_to, example_before, example_after }, file_suggestions }
 * - onCopy: () => void
 */
const PromptUpdatePreview = ({ modifier, onCopy }) => {
  if (!modifier?.modifier) {
    return null
  }

  const { title, instruction, applies_to, example_before, example_after } = modifier.modifier
  const fileSuggestions = modifier.file_suggestions || []

  return (
    <div className="space-y-4">
      {/* Title and description */}
      <div>
        <h4 className="font-medium text-gray-900 mb-1">{title}</h4>
        <div className="flex flex-wrap gap-2 mb-3">
          {applies_to?.map(area => (
            <span
              key={area}
              className="text-xs px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple"
            >
              {area}
            </span>
          ))}
        </div>
      </div>

      {/* Instruction box */}
      <div className="relative">
        <div className="bg-gray-900 rounded-lg p-4 text-sm text-gray-100 font-mono whitespace-pre-wrap">
          {instruction}
        </div>
        <button
          onClick={onCopy}
          className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          title="Copy to clipboard"
        >
          <ClipboardDocumentIcon className="w-4 h-4 text-gray-300" />
        </button>
      </div>

      {/* Example before/after */}
      {(example_before || example_after) && (
        <div className="space-y-3">
          <h5 className="text-sm font-medium text-gray-700">Example</h5>
          <div className="grid sm:grid-cols-2 gap-3">
            {example_before && (
              <div>
                <span className="text-xs font-medium text-red-600 mb-1 block">Before</span>
                <div className="text-sm text-gray-700 bg-red-50 border border-red-100 rounded p-3">
                  {example_before}
                </div>
              </div>
            )}
            {example_after && (
              <div>
                <span className="text-xs font-medium text-green-600 mb-1 block">After</span>
                <div className="text-sm text-gray-700 bg-green-50 border border-green-100 rounded p-3">
                  {example_after}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* File suggestions */}
      {fileSuggestions.length > 0 && (
        <div className="border-t border-gray-200 pt-4">
          <h5 className="text-sm font-medium text-gray-700 mb-3">
            Suggested location to add this modifier
          </h5>
          <div className="space-y-2">
            {fileSuggestions.map((suggestion, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg text-sm"
              >
                <DocumentTextIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div>
                  <div className="font-mono text-gray-900">{suggestion.file}</div>
                  <div className="text-gray-600 mt-1">
                    Section: <span className="font-medium">{suggestion.section}</span>
                  </div>
                  <div className="text-gray-500 flex items-center gap-1 mt-1">
                    <ArrowRightIcon className="w-3 h-3" />
                    {suggestion.where_to_add}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual instructions */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm">
        <p className="text-blue-800">
          <strong>To apply this preference to future courses:</strong>
        </p>
        <ol className="list-decimal list-inside text-blue-700 mt-2 space-y-1">
          <li>Copy the instruction text above</li>
          <li>Open the suggested prompt file in your editor</li>
          <li>Add it to the specified section</li>
          <li>Commit the change to version control</li>
        </ol>
      </div>
    </div>
  )
}

export default PromptUpdatePreview
