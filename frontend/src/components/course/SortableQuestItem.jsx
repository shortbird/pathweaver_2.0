import React, { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Bars3Icon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'

/**
 * Sortable quest item component for drag-and-drop reordering in course builder.
 * Displays quest title, order number, and provides publish/remove actions.
 */
const SortableQuestItem = ({
  quest,
  index,
  isSelected,
  onSelect,
  onRemove,
  onTogglePublish,
  onXpThresholdChange
}) => {
  const [xpValue, setXpValue] = useState(quest.xp_threshold || 0)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: quest.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isPublished = quest.is_published !== false

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(quest)}
      className={`group flex items-center gap-2 p-3 rounded-lg transition-all cursor-pointer ${
        isSelected
          ? 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border-2 border-optio-purple'
          : 'bg-white border border-gray-200 hover:border-optio-purple/50'
      } ${!isPublished ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
      >
        <Bars3Icon className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span className="text-xs font-medium text-gray-500 mt-0.5">
            {index + 1}
          </span>
          <div className="flex-1">
            <h4 className={`font-medium text-sm leading-snug ${isPublished ? 'text-gray-900' : 'text-gray-500'}`}>
              {quest.title || 'Untitled Project'}
            </h4>
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="number"
                min="0"
                value={xpValue}
                onChange={(e) => setXpValue(e.target.value)}
                onBlur={(e) => {
                  const newValue = parseInt(e.target.value) || 0
                  if (newValue !== (quest.xp_threshold || 0)) {
                    onXpThresholdChange?.(quest.id, newValue)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur()
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-14 px-1.5 py-0.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-optio-purple focus:border-optio-purple"
              />
              <span className="text-xs text-gray-500">XP required</span>
            </div>
          </div>
          {!isPublished && (
            <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Draft</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onTogglePublish(quest.id, !isPublished)
        }}
        className={`opacity-0 group-hover:opacity-100 p-1.5 rounded transition-all ${
          isPublished
            ? 'text-green-600 hover:bg-green-50'
            : 'text-gray-400 hover:bg-gray-100'
        }`}
        aria-label={isPublished ? 'Unpublish project' : 'Publish project'}
        title={isPublished ? 'Unpublish project' : 'Publish project'}
      >
        {isPublished ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(quest.id)
        }}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-red-600 hover:bg-red-50 rounded transition-all"
        aria-label="Remove quest"
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  )
}

export default SortableQuestItem
