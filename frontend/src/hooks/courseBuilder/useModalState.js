import { useState, useCallback } from 'react'

/**
 * Manages modal visibility state for the Course Builder.
 * Extracted to reduce complexity in the main hook.
 */
export function useModalState() {
  // Modal visibility states
  const [showAddQuestModal, setShowAddQuestModal] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showCourseDetails, setShowCourseDetails] = useState(false)
  const [showLessonEditor, setShowLessonEditor] = useState(false)
  const [showBulkTaskModal, setShowBulkTaskModal] = useState(false)
  const [showRefineModal, setShowRefineModal] = useState(false)
  const [showAIToolsModal, setShowAIToolsModal] = useState(false)
  const [showAddTaskModal, setShowAddTaskModal] = useState(false)

  // Modal content states
  const [editingLesson, setEditingLesson] = useState(null)
  const [previewingLesson, setPreviewingLesson] = useState(null)
  const [movingLesson, setMovingLesson] = useState(null)
  const [addingTaskToLesson, setAddingTaskToLesson] = useState(null)

  // Loading/operation states
  const [isPublishing, setIsPublishing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Helper to close all modals
  const closeAllModals = useCallback(() => {
    setShowAddQuestModal(false)
    setShowPreview(false)
    setShowCourseDetails(false)
    setShowLessonEditor(false)
    setShowBulkTaskModal(false)
    setShowRefineModal(false)
    setShowAIToolsModal(false)
    setShowAddTaskModal(false)
    setEditingLesson(null)
    setPreviewingLesson(null)
    setMovingLesson(null)
    setAddingTaskToLesson(null)
  }, [])

  // Open lesson editor for new or existing lesson
  const openLessonEditor = useCallback((lesson = null) => {
    setEditingLesson(lesson)
    setShowLessonEditor(true)
  }, [])

  // Close lesson editor
  const closeLessonEditor = useCallback(() => {
    setEditingLesson(null)
    setShowLessonEditor(false)
  }, [])

  // Open task modal for a lesson
  const openAddTaskModal = useCallback((lesson) => {
    setAddingTaskToLesson(lesson)
    setShowAddTaskModal(true)
  }, [])

  // Close task modal
  const closeAddTaskModal = useCallback(() => {
    setAddingTaskToLesson(null)
    setShowAddTaskModal(false)
  }, [])

  return {
    // Modal visibility
    showAddQuestModal,
    setShowAddQuestModal,
    showPreview,
    setShowPreview,
    showCourseDetails,
    setShowCourseDetails,
    showLessonEditor,
    setShowLessonEditor,
    showBulkTaskModal,
    setShowBulkTaskModal,
    showRefineModal,
    setShowRefineModal,
    showAIToolsModal,
    setShowAIToolsModal,
    showAddTaskModal,
    setShowAddTaskModal,

    // Modal content
    editingLesson,
    setEditingLesson,
    previewingLesson,
    setPreviewingLesson,
    movingLesson,
    setMovingLesson,
    addingTaskToLesson,
    setAddingTaskToLesson,

    // Operation states
    isPublishing,
    setIsPublishing,
    isCreating,
    setIsCreating,
    isDeleting,
    setIsDeleting,

    // Helpers
    closeAllModals,
    openLessonEditor,
    closeLessonEditor,
    openAddTaskModal,
    closeAddTaskModal,
  }
}

export default useModalState
