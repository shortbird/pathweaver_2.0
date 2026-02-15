import { useState, useCallback } from 'react'

/**
 * Manages selection and navigation state for the Course Builder outline.
 * Handles what's selected and what's expanded in the tree view.
 */
export function useSelectionState() {
  // Currently selected item and its type
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedType, setSelectedType] = useState(null) // 'project' | 'lesson' | 'step' | 'task'

  // Expanded items in the outline tree
  const [expandedIds, setExpandedIds] = useState(new Set())

  // Outline panel collapsed state
  const [outlineCollapsed, setOutlineCollapsed] = useState(false)

  // Select an item in the outline
  const handleSelectItem = useCallback((item, type, onTaskFetch) => {
    setSelectedItem(item)
    setSelectedType(type)

    // If selecting a lesson, trigger task fetch callback if provided
    if (type === 'lesson' && item && onTaskFetch) {
      onTaskFetch(item)
    }
  }, [])

  // Toggle expand/collapse for an item
  const handleToggleExpand = useCallback((id, onExpand) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
        // Trigger callback when expanding (e.g., to fetch tasks)
        if (onExpand) {
          onExpand(id)
        }
      }
      return newSet
    })
  }, [])

  // Expand a specific item
  const expandItem = useCallback((id) => {
    setExpandedIds(prev => new Set([...prev, id]))
  }, [])

  // Collapse a specific item
  const collapseItem = useCallback((id) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev)
      newSet.delete(id)
      return newSet
    })
  }, [])

  // Expand all items
  const expandAll = useCallback((ids) => {
    setExpandedIds(new Set(ids))
  }, [])

  // Collapse all items
  const collapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedItem(null)
    setSelectedType(null)
  }, [])

  // Check if an item is selected
  const isSelected = useCallback((item, type) => {
    return selectedItem?.id === item?.id && selectedType === type
  }, [selectedItem, selectedType])

  // Check if an item is expanded
  const isExpanded = useCallback((id) => {
    return expandedIds.has(id)
  }, [expandedIds])

  return {
    // State
    selectedItem,
    setSelectedItem,
    selectedType,
    setSelectedType,
    expandedIds,
    setExpandedIds,
    outlineCollapsed,
    setOutlineCollapsed,

    // Handlers
    handleSelectItem,
    handleToggleExpand,
    expandItem,
    collapseItem,
    expandAll,
    collapseAll,
    clearSelection,

    // Utilities
    isSelected,
    isExpanded,
  }
}

export default useSelectionState
