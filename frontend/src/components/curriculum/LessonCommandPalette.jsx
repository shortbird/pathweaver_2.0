import React, { useEffect, useState } from 'react'
import { SparklesIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { renderMarkdown } from '../../utils/markdownRenderer'

// Primary commands shown as chips. These are imperative actions the AI performs
// on the current lesson section (see backend LessonHelperService).
const PRIMARY_COMMANDS = [
  { id: 'simplify', label: 'Simplify', prompt: 'Please simplify this content using easier words that are simple to understand.' },
  { id: 'example', label: 'Give an example', prompt: 'Give me a real-world example of this concept.' },
  { id: 'analogy', label: 'Use an analogy', prompt: 'Explain this using an analogy I can relate to.' },
  { id: 'diagram', label: 'Draw a diagram', prompt: 'Draw a simple ASCII diagram to help me visualize this concept.' },
  { id: 'why', label: 'Why it matters', prompt: 'Why is this concept important? How will it help me?' },
]

const MORE_COMMANDS = [
  { id: 'details', label: 'More detail', prompt: 'Give me more detailed information about this topic.' },
  { id: 'realworld', label: 'Real-world uses', prompt: 'How is this used in the real world? Give me practical applications.' },
  { id: 'connections', label: 'What connects to this', prompt: 'What other concepts or topics connect to this? How does it fit in the bigger picture?' },
  { id: 'whatif', label: 'What if…?', prompt: 'Explore some interesting "what if" scenarios related to this concept.' },
  { id: 'expert', label: 'Expert view', prompt: 'How would an expert in this field think about or approach this concept?' },
]

const FOLLOWUP_COMMANDS = [
  { id: 'another', label: 'Try another way', prompt: 'Explain this again, but using a completely different approach.' },
  { id: 'more', label: 'Tell me more', prompt: 'Tell me more about this. Go deeper into the details.' },
]

/**
 * LessonCommandPalette
 *
 * Always-visible palette under the lesson content. Instead of opening a modal,
 * the student picks a command (Simplify, Give an example, Draw a diagram, …) and
 * the AI result renders inline below the chips. Tied to the current section via
 * blockIndex; the result resets when the student moves to a different section.
 */
export default function LessonCommandPalette({ lessonId, blockIndex, canUse = true }) {
  const [showMore, setShowMore] = useState(false)
  const [activeId, setActiveId] = useState(null)
  const [activeLabel, setActiveLabel] = useState('')
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [conversationId, setConversationId] = useState(null)

  // Reset the inline result when the student moves to a different section.
  useEffect(() => {
    setActiveId(null)
    setActiveLabel('')
    setResponse(null)
    setError(null)
  }, [blockIndex, lessonId])

  if (!canUse) return null

  const runCommand = async (command) => {
    setActiveId(command.id)
    setActiveLabel(command.label)
    setResponse(null)
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.post('/api/lesson-helper/chat', {
        message: command.prompt,
        conversation_id: conversationId,
        mode: 'teacher',
        lesson_id: lessonId,
        block_index: blockIndex,
        action_type: command.id,
      })
      const payload = data.data || data
      setResponse(payload.response)
      if (!conversationId && payload.conversation_id) {
        setConversationId(payload.conversation_id)
      }
    } catch (err) {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const Chip = ({ command }) => (
    <button
      onClick={() => runCommand(command)}
      disabled={loading}
      className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors disabled:opacity-50 ${
        activeId === command.id
          ? 'bg-optio-purple text-white border-optio-purple'
          : 'bg-white text-gray-700 border-gray-300 hover:border-optio-purple hover:text-optio-purple'
      }`}
    >
      {command.label}
    </button>
  )

  return (
    <div className="mt-6 rounded-xl border border-optio-purple/20 bg-optio-purple/[0.03] p-4">
      <div className="flex items-center gap-2 mb-3">
        <SparklesIcon className="w-4 h-4 text-optio-purple" />
        <span className="text-sm font-semibold text-gray-700">Engage with this section</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRIMARY_COMMANDS.map(c => <Chip key={c.id} command={c} />)}
        {showMore && MORE_COMMANDS.map(c => <Chip key={c.id} command={c} />)}
        <button
          onClick={() => setShowMore(v => !v)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          {showMore ? 'Fewer' : 'More ways'}
          <ChevronDownIcon className={`w-4 h-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Inline result */}
      {(loading || response || error) && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          {activeLabel && (
            <div className="text-xs font-semibold uppercase tracking-wide text-optio-purple mb-2">
              {activeLabel}
            </div>
          )}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-optio-purple border-t-transparent" />
              Thinking…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                {renderMarkdown(response)}
              </div>
              <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
                {FOLLOWUP_COMMANDS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => runCommand(c)}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-300 text-gray-600 hover:border-optio-purple hover:text-optio-purple transition-colors disabled:opacity-50"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
