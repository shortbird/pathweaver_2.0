import { useEffect, useCallback, useMemo } from 'react'

/**
 * useOutlineKeyboard - Hook for keyboard navigation in the course outline tree
 *
 * Keyboard shortcuts:
 * - Arrow Up/Down: Navigate between items
 * - Arrow Left: Collapse current item or move to parent
 * - Arrow Right: Expand current item or move to first child
 * - Enter: Edit selected item
 * - Delete/Backspace: Delete selected item (with confirmation)
 * - Home: Jump to first item
 * - End: Jump to last item
 */
const useOutlineKeyboard = ({
  projects,
  lessonsMap,
  tasksMap,
  expandedIds,
  selectedItem,
  selectedType,
  onSelectItem,
  onToggleExpand,
  onEdit,
  onDelete,
  enabled = true,
}) => {
  // Build a flat list of visible items for navigation
  const flatList = useMemo(() => {
    const items = []

    projects.forEach(project => {
      items.push({ item: project, type: 'project' })

      if (expandedIds.has(project.id)) {
        const lessons = lessonsMap[project.id] || []
        lessons.forEach(lesson => {
          items.push({ item: lesson, type: 'lesson', parentId: project.id })

          if (expandedIds.has(lesson.id)) {
            const tasks = tasksMap[lesson.id] || []
            tasks.forEach(task => {
              items.push({ item: task, type: 'task', parentId: lesson.id })
            })
          }
        })
      }
    })

    return items
  }, [projects, lessonsMap, tasksMap, expandedIds])

  // Find current index in flat list
  const getCurrentIndex = useCallback(() => {
    if (!selectedItem) return -1
    return flatList.findIndex(
      entry => entry.item.id === selectedItem.id && entry.type === selectedType
    )
  }, [flatList, selectedItem, selectedType])

  // Navigate to item at index
  const navigateToIndex = useCallback((index) => {
    if (index >= 0 && index < flatList.length) {
      const entry = flatList[index]
      onSelectItem(entry.item, entry.type)
    }
  }, [flatList, onSelectItem])

  // Get parent item for current selection
  const getParentEntry = useCallback(() => {
    const currentIndex = getCurrentIndex()
    if (currentIndex === -1) return null

    const current = flatList[currentIndex]
    if (!current.parentId) return null

    // Find the parent item
    return flatList.find(entry =>
      entry.item.id === current.parentId
    )
  }, [getCurrentIndex, flatList])

  // Get first child entry for current selection
  const getFirstChildEntry = useCallback(() => {
    const currentIndex = getCurrentIndex()
    if (currentIndex === -1) return null

    const current = flatList[currentIndex]

    // Tasks don't have children
    if (current.type === 'task') return null

    // Find the next item that is a child of current
    const nextIndex = currentIndex + 1
    if (nextIndex < flatList.length) {
      const next = flatList[nextIndex]
      if (next.parentId === current.item.id) {
        return next
      }
    }
    return null
  }, [getCurrentIndex, flatList])

  // Keyboard event handler
  const handleKeyDown = useCallback((event) => {
    // Don't handle if focus is in an input/textarea
    if (
      event.target.tagName === 'INPUT' ||
      event.target.tagName === 'TEXTAREA' ||
      event.target.tagName === 'SELECT' ||
      event.target.isContentEditable
    ) {
      return
    }

    const currentIndex = getCurrentIndex()
    const current = currentIndex >= 0 ? flatList[currentIndex] : null

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        if (currentIndex > 0) {
          navigateToIndex(currentIndex - 1)
        }
        break

      case 'ArrowDown':
        event.preventDefault()
        if (currentIndex < flatList.length - 1) {
          navigateToIndex(currentIndex + 1)
        } else if (currentIndex === -1 && flatList.length > 0) {
          // No selection, select first item
          navigateToIndex(0)
        }
        break

      case 'ArrowLeft':
        event.preventDefault()
        if (current) {
          // If expanded, collapse
          if (expandedIds.has(current.item.id)) {
            onToggleExpand?.(current.item.id)
          } else {
            // Move to parent
            const parent = getParentEntry()
            if (parent) {
              onSelectItem(parent.item, parent.type)
            }
          }
        }
        break

      case 'ArrowRight':
        event.preventDefault()
        if (current) {
          // If collapsed and has children, expand
          if (!expandedIds.has(current.item.id) && current.type !== 'task') {
            onToggleExpand?.(current.item.id)
          } else {
            // Move to first child
            const firstChild = getFirstChildEntry()
            if (firstChild) {
              onSelectItem(firstChild.item, firstChild.type)
            }
          }
        }
        break

      case 'Enter':
        event.preventDefault()
        if (current) {
          onEdit?.(current.item, current.type)
        }
        break

      case 'Delete':
      case 'Backspace':
        // Only handle Delete key, not Backspace (to avoid conflicts with text editing)
        if (event.key === 'Delete' && current) {
          event.preventDefault()
          onDelete?.(current.item, current.type)
        }
        break

      case 'Home':
        event.preventDefault()
        if (flatList.length > 0) {
          navigateToIndex(0)
        }
        break

      case 'End':
        event.preventDefault()
        if (flatList.length > 0) {
          navigateToIndex(flatList.length - 1)
        }
        break

      default:
        break
    }
  }, [
    getCurrentIndex,
    flatList,
    expandedIds,
    navigateToIndex,
    onToggleExpand,
    onSelectItem,
    onEdit,
    onDelete,
    getParentEntry,
    getFirstChildEntry,
  ])

  // Attach keyboard listener
  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, enabled])

  return {
    flatList,
    getCurrentIndex,
    navigateToIndex,
  }
}

export default useOutlineKeyboard
