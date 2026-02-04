import React from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import StudentPreviewModal from '../../components/course/StudentPreviewModal'
import LessonPreviewModal from '../../components/curriculum/LessonPreviewModal'
import {
  AddQuestModal,
  LessonEditorModal,
  CourseDetailsModal,
  BulkTaskGenerationModal,
  MoveLessonModal,
  AIToolsModal,
  OutlineTree,
  OutlineEditor,
  NewCourseForm,
  CourseBuilderHeader,
} from '../../components/course'
import { AIRefineModal } from '../../components/course/refine'
import useOutlineKeyboard from '../../hooks/useOutlineKeyboard'
import useCourseBuilderState from '../../hooks/useCourseBuilderState'

const CourseBuilder = () => {
  const { id: courseId } = useParams()
  const { isSuperadmin } = useAuth()
  const isNewCourse = courseId === 'new' || !courseId

  // All state and handlers from custom hook
  const state = useCourseBuilderState({ courseId, isNewCourse, isSuperadmin })

  // Keyboard navigation
  useOutlineKeyboard({
    projects: state.quests,
    lessonsMap: state.lessonsMap,
    tasksMap: state.tasksMap,
    expandedIds: state.expandedIds,
    selectedItem: state.selectedItem,
    selectedType: state.selectedType,
    onSelectItem: state.handleSelectItem,
    onToggleExpand: state.handleToggleExpand,
    onEdit: (item, type) => {
      if (type === 'lesson') {
        state.setEditingLesson(item)
        state.setShowLessonEditor(true)
      }
    },
    onDelete: state.handleDeleteItem,
    enabled: !state.showLessonEditor && !state.showAddQuestModal && !state.showCourseDetails,
  })

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  // New course creation form
  if (isNewCourse) {
    return (
      <NewCourseForm
        course={state.course}
        setCourse={state.setCourse}
        isCreating={state.isCreating}
        onCreateCourse={state.handleCreateCourse}
      />
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <CourseBuilderHeader
        course={state.course}
        quests={state.quests}
        saveStatus={state.saveStatus}
        isPublishing={state.isPublishing}
        onShowCourseDetails={() => state.setShowCourseDetails(true)}
        onShowAITools={() => state.setShowAIToolsModal(true)}
        onShowPreview={() => state.setShowPreview(true)}
        onPublishToggle={state.handlePublishToggle}
      />

      {/* Main Content - Outline View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Outline Tree */}
        <OutlineTree
          course={state.course}
          projects={state.quests}
          lessonsMap={state.lessonsMap}
          tasksMap={state.tasksMap}
          selectedItem={state.selectedItem}
          selectedType={state.selectedType}
          onSelectItem={state.handleSelectItem}
          onAddProject={() => state.setShowAddQuestModal(true)}
          onAddLesson={state.handleAddChild}
          onAddTask={state.handleAddChild}
          onAddStep={state.handleAddStep}
          onEditItem={state.handleEditItem}
          onDeleteItem={state.handleDeleteItem}
          onMoveItem={state.handleMoveItem}
          onReorderProjects={state.handleReorderProjects}
          onReorderLessons={state.handleReorderLessons}
          onReorderSteps={state.handleReorderSteps}
          isCollapsed={state.outlineCollapsed}
          onToggleCollapse={() => state.setOutlineCollapsed(!state.outlineCollapsed)}
        />

        {/* Right Panel - Editor */}
        <OutlineEditor
          selectedItem={state.selectedItem}
          selectedType={state.selectedType}
          onSave={state.handleSaveFromEditor}
          onSelectItem={state.handleSelectItem}
          tasksMap={state.tasksMap}
          onAddStep={state.handleAddStep}
          onDeleteStep={state.handleDeleteStep}
          onToggleTaskRequired={state.handleToggleTaskRequired}
          saving={state.saving}
          questId={state.selectedItem?.lessonId ? Object.keys(state.lessonsMap).find(pid => state.lessonsMap[pid]?.some(l => l.id === state.selectedItem.lessonId)) : state.selectedItem?.id}
        />
      </div>

      {/* Modals */}
      <AddQuestModal
        isOpen={state.showAddQuestModal}
        onClose={() => state.setShowAddQuestModal(false)}
        onAddQuest={state.handleAddQuest}
        organizationId={state.course?.organization_id}
        existingQuestIds={state.quests.map(q => q.id)}
      />

      {state.showPreview && (
        <StudentPreviewModal
          course={state.course}
          projects={state.quests}
          lessonsMap={state.lessonsMap}
          tasksMap={state.tasksMap}
          initialProjectId={state.selectedItem?.id && state.selectedType === 'project' ? state.selectedItem.id : null}
          initialLessonId={state.selectedItem?.id && state.selectedType === 'lesson' ? state.selectedItem.id : null}
          onClose={() => state.setShowPreview(false)}
        />
      )}

      <CourseDetailsModal
        isOpen={state.showCourseDetails}
        onClose={() => state.setShowCourseDetails(false)}
        course={state.course}
        courseId={courseId}
        onUpdate={state.handleUpdateCourse}
        onDelete={state.handleDeleteCourse}
        isSaving={state.saveStatus === 'saving'}
        isDeleting={state.isDeleting}
        questCount={state.quests?.length || 0}
      />

      {state.previewingLesson && (
        <LessonPreviewModal
          lesson={state.previewingLesson}
          onClose={() => state.setPreviewingLesson(null)}
          onEdit={(lesson) => {
            state.setPreviewingLesson(null)
            state.setEditingLesson(lesson)
            state.setShowLessonEditor(true)
          }}
        />
      )}

      <LessonEditorModal
        isOpen={state.showLessonEditor}
        questId={state.selectedQuestForLesson?.id}
        lesson={state.editingLesson}
        onSave={state.handleLessonSaved}
        onClose={() => {
          state.setShowLessonEditor(false)
          state.setEditingLesson(null)
        }}
      />

      <AIToolsModal
        isOpen={state.showAIToolsModal}
        onClose={() => state.setShowAIToolsModal(false)}
        onSelectTool={state.handleAIToolSelect}
        hasLessonsWithoutTasks={state.hasLessonsWithoutTasks}
        hasProjectsWithoutLessons={state.hasProjectsWithoutLessons}
        hasLessonsWithoutContent={state.hasLessonsWithoutContent}
      />

      <BulkTaskGenerationModal
        isOpen={state.showBulkTaskModal}
        onClose={() => state.setShowBulkTaskModal(false)}
        quests={state.quests}
        onTasksUpdated={state.refreshLessonsForQuests}
      />

      <AIRefineModal
        isOpen={state.showRefineModal}
        onClose={() => state.setShowRefineModal(false)}
        courseId={courseId}
        courseName={state.course?.title || 'Course'}
        onRefineComplete={state.handleRefineComplete}
      />

      {state.movingLesson && (
        <MoveLessonModal
          isOpen={!!state.movingLesson}
          onClose={() => state.setMovingLesson(null)}
          lesson={state.movingLesson}
          currentQuestId={Object.keys(state.lessonsMap).find(pid =>
            state.lessonsMap[pid]?.some(l => l.id === state.movingLesson.id)
          )}
          quests={state.quests}
          courseId={courseId}
          onMove={state.handleLessonMoved}
        />
      )}
    </div>
  )
}

export default CourseBuilder
