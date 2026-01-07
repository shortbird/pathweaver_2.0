import React, { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Bars3Icon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline'

/**
 * Sortable lesson item component for drag-and-drop reordering.
 * Displays lesson info with a dropdown menu for preview/edit/delete actions.
 */
const SortableLessonItem = ({
  lesson,
  isSelected,
  onSelect,
  onPreview,
  onEdit,
  onDelete
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const taskCount = lesson.linked_task_ids?.length || 0

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect?.(lesson)}
      className={`relative flex items-center gap-3 p-3 rounded-lg border transition-colors group cursor-pointer ${
        isSelected
          ? 'border-optio-purple bg-optio-purple/5'
          : 'border-gray-200 hover:border-optio-purple/50'
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <Bars3Icon className="w-4 h-4" />
      </button>
      <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-optio-purple/10 text-optio-purple rounded-full text-xs font-medium">
        {lesson.sequence_order || lesson.order || 1}
      </span>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-gray-900 truncate">
          {lesson.title}
        </h4>
        {taskCount > 0 && (
          <div className="text-xs text-gray-500">
            {taskCount} task{taskCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen(!menuOpen)
          }}
          className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
          aria-label="Lesson options"
        >
          <EllipsisVerticalIcon className="w-5 h-5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[100px]">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onPreview(lesson)
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Preview
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onEdit(lesson)
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(false)
                onDelete(lesson)
              }}
              className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default SortableLessonItem
