import React, { useState } from 'react'
import { CheckIcon, PencilIcon } from '@heroicons/react/24/outline'

/**
 * ClarifyingQuestion - A question with clickable suggestion chips
 *
 * Props:
 * - question: { id, question, context, suggestions: [{ id, label, description }] }
 * - selectedAnswer: string | null
 * - onSelect: (answer: string) => void
 */
const ClarifyingQuestion = ({ question, selectedAnswer, onSelect }) => {
  const [isCustom, setIsCustom] = useState(false)
  const [customAnswer, setCustomAnswer] = useState('')

  const handleSuggestionClick = (suggestion) => {
    setIsCustom(false)
    onSelect(suggestion.label)
  }

  const handleCustomSubmit = () => {
    if (customAnswer.trim()) {
      onSelect(customAnswer.trim())
    }
  }

  const handleCustomClick = () => {
    setIsCustom(true)
    if (customAnswer.trim()) {
      onSelect(customAnswer.trim())
    }
  }

  // Check if a suggestion is selected
  const isSuggestionSelected = (suggestion) => {
    return !isCustom && selectedAnswer === suggestion.label
  }

  // Check if custom answer is selected
  const isCustomSelected = isCustom && customAnswer.trim() && selectedAnswer === customAnswer.trim()

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      {/* Question text */}
      <div className="mb-3">
        <h4 className="font-medium text-gray-900 mb-1">{question.question}</h4>
        {question.context && (
          <p className="text-sm text-gray-500">{question.context}</p>
        )}
      </div>

      {/* Suggestion chips */}
      <div className="space-y-2">
        {question.suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            onClick={() => handleSuggestionClick(suggestion)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              isSuggestionSelected(suggestion)
                ? 'border-optio-purple bg-optio-purple/5'
                : 'border-gray-200 hover:border-optio-purple/50 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                isSuggestionSelected(suggestion)
                  ? 'border-optio-purple bg-optio-purple'
                  : 'border-gray-300'
              }`}>
                {isSuggestionSelected(suggestion) && (
                  <CheckIcon className="w-3 h-3 text-white" />
                )}
              </div>
              <div>
                <span className="font-medium text-gray-900">{suggestion.label}</span>
                {suggestion.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{suggestion.description}</p>
                )}
              </div>
            </div>
          </button>
        ))}

        {/* Custom answer option */}
        <div
          className={`w-full text-left p-3 rounded-lg border transition-colors ${
            isCustom
              ? 'border-optio-purple bg-optio-purple/5'
              : 'border-gray-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <button
              onClick={handleCustomClick}
              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                isCustomSelected
                  ? 'border-optio-purple bg-optio-purple'
                  : isCustom
                  ? 'border-optio-purple'
                  : 'border-gray-300'
              }`}
            >
              {isCustomSelected && (
                <CheckIcon className="w-3 h-3 text-white" />
              )}
            </button>
            <div className="flex-1">
              {isCustom ? (
                <div className="space-y-2">
                  <textarea
                    value={customAnswer}
                    onChange={(e) => {
                      setCustomAnswer(e.target.value)
                      if (e.target.value.trim()) {
                        onSelect(e.target.value.trim())
                      }
                    }}
                    placeholder="Type your own answer..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setIsCustom(false)
                      if (!customAnswer.trim()) {
                        // Clear selection if custom was empty
                        onSelect(null)
                      }
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleCustomClick}
                  className="flex items-center gap-2 text-gray-700 hover:text-optio-purple"
                >
                  <PencilIcon className="w-4 h-4" />
                  <span>Other (type your own)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ClarifyingQuestion
