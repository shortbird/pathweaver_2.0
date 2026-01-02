import React, { useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import LessonEditor from '../LessonEditor'

/**
 * Full screen modal for editing lessons.
 * Wraps the LessonEditor component with modal chrome.
 */
const LessonEditorModal = ({
  isOpen,
  questId,
  lesson,
  onSave,
  onClose
}) => {
  const editorRef = useRef(null)

  const handleClose = () => {
    // Fire autosave in background and close immediately
    if (editorRef.current?.save) {
      editorRef.current.save()
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white w-full h-full md:w-[95vw] md:h-[95vh] md:max-w-7xl md:rounded-xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            {lesson ? 'Edit Lesson' : 'New Lesson'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <LessonEditor
            ref={editorRef}
            questId={questId}
            lesson={lesson}
            onSave={onSave}
            onCancel={handleClose}
          />
        </div>
      </div>
    </div>
  )
}

export default LessonEditorModal
