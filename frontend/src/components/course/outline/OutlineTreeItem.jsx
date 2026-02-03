import React, { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FolderIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  Bars3Icon,
  EllipsisVerticalIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowsPointingOutIcon,
  ExclamationTriangleIcon,
  Bars3BottomLeftIcon,
} from '@heroicons/react/24/outline'
import { getPillarData } from '../../../utils/pillarMappings'

/**
 * OutlineTreeItem - Individual tree node component for the course outline
 * Supports Projects, Lessons, Steps, and Tasks with expand/collapse, drag handles, and context menus
 */
const OutlineTreeItem = ({
  item,
  type, // 'project' | 'lesson' | 'step' | 'task'
  depth = 0,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddChild,
  onMove,
  children,
  hasChildren,
  hasWarning, // e.g., lesson with no tasks
  isPublished,
  isRequired,
  isDraggable = true,
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
  } = useSortable({
    id: item.id,
    disabled: !isDraggable,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

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

  // Get icon based on type
  const getIcon = () => {
    switch (type) {
      case 'project':
        return <FolderIcon className="w-4 h-4" />
      case 'lesson':
        return <DocumentTextIcon className="w-4 h-4" />
      case 'step':
        return <Bars3BottomLeftIcon className="w-4 h-4" />
      case 'task':
        return <CheckCircleIcon className="w-4 h-4" />
      default:
        return <DocumentTextIcon className="w-4 h-4" />
    }
  }

  // Get display name
  const getDisplayName = () => {
    return item.title || `Untitled ${type}`
  }

  // Get subtitle info
  const getSubtitle = () => {
    if (type === 'project') {
      const xpThreshold = item.xp_threshold || 0
      return xpThreshold > 0 ? `${xpThreshold} XP required` : null
    }
    if (type === 'lesson') {
      const stepCount = item.content?.steps?.length || 0
      return stepCount > 0 ? `${stepCount} step${stepCount !== 1 ? 's' : ''}` : null
    }
    if (type === 'step') {
      return null // No subtitle for steps
    }
    if (type === 'task') {
      const pillarData = getPillarData(item.pillar)
      return `${pillarData.name} - ${item.xp_value || 100} XP`
    }
    return null
  }

  // Get pillar color for tasks
  const getPillarColor = () => {
    if (type === 'task' && item.pillar) {
      return getPillarData(item.pillar).color
    }
    return null
  }

  const pillarColor = getPillarColor()
  const subtitle = getSubtitle()

  return (
    <div ref={setNodeRef} style={style}>
      <div
        onClick={() => onSelect?.(item, type)}
        className={`
          group flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer transition-colors
          ${isSelected ? 'bg-optio-purple/10 text-optio-purple' : 'hover:bg-gray-100'}
          ${!isPublished && type === 'project' ? 'opacity-60' : ''}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {/* Drag handle */}
        {isDraggable && (
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            aria-label="Drag to reorder"
          >
            <Bars3Icon className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand?.(item.id)
            }}
            className="p-0.5 text-gray-400 hover:text-gray-600"
          >
            {isExpanded ? (
              <ChevronDownIcon className="w-3.5 h-3.5" />
            ) : (
              <ChevronRightIcon className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-4.5" /> // Spacer for alignment
        )}

        {/* Icon */}
        <span
          className={`flex-shrink-0 ${isSelected ? 'text-optio-purple' : 'text-gray-500'}`}
          style={pillarColor ? { color: pillarColor } : undefined}
        >
          {getIcon()}
        </span>

        {/* Title and subtitle */}
        <div className="flex-1 min-w-0 ml-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium truncate">
              {getDisplayName()}
            </span>
            {/* Status badges */}
            {type === 'task' && isRequired !== undefined && (
              <span
                className={`px-1 py-0.5 text-[10px] font-medium rounded ${
                  isRequired
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {isRequired ? 'Req' : 'Opt'}
              </span>
            )}
            {type === 'project' && !isPublished && (
              <span className="px-1 py-0.5 text-[10px] font-medium bg-gray-200 text-gray-600 rounded">
                Draft
              </span>
            )}
            {hasWarning && (
              <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500" title="No tasks linked" />
            )}
          </div>
          {subtitle && (
            <span className="text-xs text-gray-500 truncate block">{subtitle}</span>
          )}
        </div>

        {/* Context menu - not shown for steps (they have delete in the editor) */}
        {type !== 'step' && (
          <div className="relative flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(!menuOpen)
              }}
              className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-200"
              aria-label="Options"
            >
              <EllipsisVerticalIcon className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 min-w-[120px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    onEdit?.(item, type)
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <PencilIcon className="w-3.5 h-3.5" />
                  Edit
                </button>
                {(type === 'project' || type === 'lesson') && onAddChild && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpen(false)
                      onAddChild?.(item, type)
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    {type === 'project' ? 'Add Lesson' : 'Add Step'}
                  </button>
                )}
                {onMove && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuOpen(false)
                      onMove?.(item, type)
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                    Move
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuOpen(false)
                    onDelete?.(item, type)
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children (expanded content) */}
      {isExpanded && children}
    </div>
  )
}

export default OutlineTreeItem
