import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

/**
 * Modal for moving a lesson to a different project within the same course.
 */
const MoveLessonModal = ({
  isOpen,
  onClose,
  lesson,
  currentQuestId,
  quests,
  courseId,
  onMove
}) => {
  const [selectedQuestId, setSelectedQuestId] = useState(null)
  const [moving, setMoving] = useState(false)

  // Filter out the current quest from available options
  const availableQuests = quests.filter(q => q.id !== currentQuestId)

  const handleMove = async () => {
    if (!selectedQuestId) return

    try {
      setMoving(true)
      await api.put(`/api/quests/${currentQuestId}/curriculum/lessons/${lesson.id}/move`, {
        target_quest_id: selectedQuestId,
        course_id: courseId
      })
      toast.success('Lesson moved successfully')
      onMove(lesson.id, selectedQuestId)
      onClose()
    } catch (error) {
      console.error('Failed to move lesson:', error)
      toast.error(error.response?.data?.error || 'Failed to move lesson')
    } finally {
      setMoving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-4">Move Lesson</h2>
        <p className="text-gray-600 mb-4">
          Move &quot;{lesson?.title}&quot; to:
        </p>

        {availableQuests.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <p>No other projects available to move this lesson to.</p>
            <p className="text-sm mt-2">Add another project to the course first.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto mb-6">
            {availableQuests.map(quest => (
              <button
                key={quest.id}
                onClick={() => setSelectedQuestId(quest.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedQuestId === quest.id
                    ? 'border-optio-purple bg-optio-purple/5'
                    : 'border-gray-200 hover:border-optio-purple/50'
                }`}
              >
                <span className="font-medium text-gray-900">{quest.title}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {availableQuests.length > 0 && (
            <button
              onClick={handleMove}
              disabled={!selectedQuestId || moving}
              className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg disabled:opacity-50 transition-opacity"
            >
              {moving ? 'Moving...' : 'Move Lesson'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default MoveLessonModal
