import React, { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from '@heroicons/react/24/outline'
import OutlineTreeItem from './OutlineTreeItem'

/**
 * OutlineTree - Left panel tree component showing course hierarchy
 * Course > Projects > Lessons > Steps
 */
const OutlineTree = ({
  course,
  projects,
  lessonsMap, // { projectId: lessons[] }
  tasksMap, // { lessonId: tasks[] } - kept for reference
  selectedItem,
  selectedType,
  onSelectItem,
  onAddProject,
  onAddLesson,
  onAddTask,
  onAddStep,
  onEditItem,
  onDeleteItem,
  onMoveItem,
  onReorderProjects,
  onReorderLessons,
  onReorderSteps,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedIds, setExpandedIds] = useState(() => {
    // Start with everything collapsed - only show projects
    return new Set()
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Toggle expansion for an item
  const handleToggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  // Expand all
  const handleExpandAll = useCallback(() => {
    const allIds = new Set()
    projects.forEach(p => {
      allIds.add(p.id)
      const lessons = lessonsMap[p.id] || []
      lessons.forEach(l => allIds.add(l.id))
    })
    setExpandedIds(allIds)
  }, [projects, lessonsMap])

  // Collapse all
  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  // Handle selection - select item AND expand it
  const handleSelectAndExpand = useCallback((item, type) => {
    // Call the original select handler
    onSelectItem?.(item, type)

    // Expand the item if it has children (projects and lessons)
    if (type === 'project' || type === 'lesson') {
      setExpandedIds(prev => {
        const newSet = new Set(prev)
        newSet.add(item.id)
        return newSet
      })
    }
  }, [onSelectItem])

  // Filter items based on search
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) {
      return { projects, lessonsMap, tasksMap, hasFilter: false }
    }

    const term = searchTerm.toLowerCase()
    const filteredProjects = []
    const filteredLessonsMap = {}
    const filteredTasksMap = {}
    const matchedProjectIds = new Set()

    projects.forEach(project => {
      const projectMatches = project.title?.toLowerCase().includes(term)
      const lessons = lessonsMap[project.id] || []
      const matchedLessons = []

      lessons.forEach(lesson => {
        const lessonMatches = lesson.title?.toLowerCase().includes(term)
        const tasks = tasksMap[lesson.id] || []
        const matchedTasks = tasks.filter(task =>
          task.title?.toLowerCase().includes(term)
        )

        if (lessonMatches || matchedTasks.length > 0) {
          matchedLessons.push(lesson)
          filteredTasksMap[lesson.id] = matchedTasks.length > 0 ? matchedTasks : tasks
          matchedProjectIds.add(project.id)
        }
      })

      if (projectMatches || matchedLessons.length > 0) {
        filteredProjects.push(project)
        filteredLessonsMap[project.id] = matchedLessons.length > 0 ? matchedLessons : lessons
        matchedProjectIds.add(project.id)
      }
    })

    // Expand all matched items when searching
    if (term) {
      setExpandedIds(prev => {
        const newSet = new Set(prev)
        matchedProjectIds.forEach(id => newSet.add(id))
        Object.keys(filteredLessonsMap).forEach(projectId => {
          filteredLessonsMap[projectId].forEach(lesson => newSet.add(lesson.id))
        })
        return newSet
      })
    }

    return {
      projects: filteredProjects,
      lessonsMap: filteredLessonsMap,
      tasksMap: filteredTasksMap,
      hasFilter: true
    }
  }, [searchTerm, projects, lessonsMap, tasksMap])

  // Handle drag end for projects
  const handleProjectDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onReorderProjects?.(active.id, over.id)
  }

  // Handle drag end for lessons within a project
  const handleLessonDragEnd = (projectId) => (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onReorderLessons?.(projectId, active.id, over.id)
  }

  // Handle drag end for steps within a lesson
  const handleStepDragEnd = (lessonId) => (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onReorderSteps?.(lessonId, active.id, over.id)
  }

  if (isCollapsed) {
    return (
      <div className="w-10 bg-white border-r border-gray-200 flex flex-col items-center py-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          title="Expand outline"
        >
          <ChevronDoubleRightIcon className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">Course Outline</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handleExpandAll}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="Expand all"
            >
              <ChevronDoubleRightIcon className="w-3.5 h-3.5 rotate-90" />
            </button>
            <button
              onClick={handleCollapseAll}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="Collapse all"
            >
              <ChevronDoubleLeftIcon className="w-3.5 h-3.5 rotate-90" />
            </button>
            <button
              onClick={onToggleCollapse}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="Collapse panel"
            >
              <ChevronDoubleLeftIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-optio-purple focus:border-optio-purple"
          />
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredData.projects.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? (
              <p className="text-sm">No matches found</p>
            ) : (
              <>
                <p className="text-sm mb-2">No projects yet</p>
                <button
                  onClick={onAddProject}
                  className="text-sm text-optio-purple hover:underline"
                >
                  Add your first project
                </button>
              </>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleProjectDragEnd}
          >
            <SortableContext
              items={filteredData.projects.map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredData.projects.map((project) => {
                const projectLessons = filteredData.lessonsMap[project.id] || lessonsMap[project.id] || []
                const isProjectExpanded = expandedIds.has(project.id)

                return (
                  <OutlineTreeItem
                    key={project.id}
                    item={project}
                    type="project"
                    depth={0}
                    isSelected={selectedItem?.id === project.id && selectedType === 'project'}
                    isExpanded={isProjectExpanded}
                    hasChildren={projectLessons.length > 0}
                    isPublished={project.is_published !== false}
                    onSelect={handleSelectAndExpand}
                    onToggleExpand={handleToggleExpand}
                    onEdit={onEditItem}
                    onDelete={onDeleteItem}
                    onAddChild={onAddLesson}
                    onMove={onMoveItem}
                  >
                    {/* Lessons within project */}
                    {isProjectExpanded && projectLessons.length > 0 && (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleLessonDragEnd(project.id)}
                      >
                        <SortableContext
                          items={projectLessons.map(l => l.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {projectLessons
                            .sort((a, b) => (a.sequence_order || a.order || 0) - (b.sequence_order || b.order || 0))
                            .map((lesson) => {
                              // Get steps from lesson content
                              const lessonSteps = lesson.content?.steps || []
                              const isLessonExpanded = expandedIds.has(lesson.id)
                              const hasNoTasks = (lesson.linked_task_ids?.length || 0) === 0

                              return (
                                <OutlineTreeItem
                                  key={lesson.id}
                                  item={lesson}
                                  type="lesson"
                                  depth={1}
                                  isSelected={selectedItem?.id === lesson.id && selectedType === 'lesson'}
                                  isExpanded={isLessonExpanded}
                                  hasChildren={lessonSteps.length > 0}
                                  hasWarning={hasNoTasks}
                                  onSelect={handleSelectAndExpand}
                                  onToggleExpand={handleToggleExpand}
                                  onEdit={onEditItem}
                                  onDelete={onDeleteItem}
                                  onAddChild={() => onAddStep?.(lesson)}
                                  onMove={onMoveItem}
                                >
                                  {/* Steps within lesson */}
                                  {isLessonExpanded && lessonSteps.length > 0 && (
                                    <DndContext
                                      sensors={sensors}
                                      collisionDetection={closestCenter}
                                      onDragEnd={handleStepDragEnd(lesson.id)}
                                    >
                                      <SortableContext
                                        items={lessonSteps.map(s => s.id || `step-${lessonSteps.indexOf(s)}`)}
                                        strategy={verticalListSortingStrategy}
                                      >
                                        {lessonSteps.map((step, stepIndex) => (
                                          <OutlineTreeItem
                                            key={step.id || `step-${stepIndex}`}
                                            item={{ ...step, id: step.id || `step-${stepIndex}`, lessonId: lesson.id, stepIndex }}
                                            type="step"
                                            depth={2}
                                            isSelected={selectedItem?.id === step.id && selectedType === 'step'}
                                            isExpanded={false}
                                            hasChildren={false}
                                            onSelect={handleSelectAndExpand}
                                            onEdit={onEditItem}
                                            onDelete={onDeleteItem}
                                            isDraggable={true}
                                          />
                                        ))}
                                      </SortableContext>
                                    </DndContext>
                                  )}
                                </OutlineTreeItem>
                              )
                            })}
                        </SortableContext>
                      </DndContext>
                    )}
                  </OutlineTreeItem>
                )
              })}
            </SortableContext>
          </DndContext>
        )}

        {/* Add Project button - below projects list */}
        <button
          onClick={onAddProject}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 mt-2 text-sm font-medium text-optio-purple border border-dashed border-optio-purple/50 rounded-lg hover:bg-optio-purple/5 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Add Project
        </button>
      </div>
    </div>
  )
}

export default OutlineTree
