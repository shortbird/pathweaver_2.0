/**
 * useBulkSelection Hook
 *
 * Reusable bulk selection logic for lists and tables.
 *
 * Usage:
 *   const {
 *     selectedIds,
 *     toggleSelection,
 *     selectAll,
 *     clearSelection,
 *     isSelected,
 *     selectedCount,
 *     isAllSelected,
 *     isSomeSelected
 *   } = useBulkSelection({ items, idKey: 'id' });
 */

import { useState, useCallback, useMemo } from 'react';

export function useBulkSelection({
  items = [],
  idKey = 'id',
  initialSelection = []
}) {
  const [selectedIds, setSelectedIds] = useState(new Set(initialSelection));

  // Get all valid IDs from items
  const allIds = useMemo(() => {
    return new Set(items.map(item => item[idKey]).filter(Boolean));
  }, [items, idKey]);

  // Toggle a single item's selection
  const toggleSelection = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Select a single item
  const select = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Deselect a single item
  const deselect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Select all items
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allIds));
  }, [allIds]);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Toggle select all
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === allIds.size && allIds.size > 0) {
      clearSelection();
    } else {
      selectAll();
    }
  }, [selectedIds.size, allIds.size, selectAll, clearSelection]);

  // Set selection to specific IDs
  const setSelection = useCallback((ids) => {
    setSelectedIds(new Set(ids));
  }, []);

  // Check if an item is selected
  const isSelected = useCallback((id) => {
    return selectedIds.has(id);
  }, [selectedIds]);

  // Get selected items
  const selectedItems = useMemo(() => {
    return items.filter(item => selectedIds.has(item[idKey]));
  }, [items, selectedIds, idKey]);

  const selectedCount = selectedIds.size;
  const isAllSelected = allIds.size > 0 && selectedIds.size === allIds.size;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < allIds.size;
  const hasSelection = selectedIds.size > 0;

  // Clean up invalid selections when items change
  useMemo(() => {
    const validSelections = new Set();
    selectedIds.forEach(id => {
      if (allIds.has(id)) {
        validSelections.add(id);
      }
    });
    if (validSelections.size !== selectedIds.size) {
      setSelectedIds(validSelections);
    }
  }, [allIds, selectedIds]);

  return {
    selectedIds: Array.from(selectedIds),
    selectedIdsSet: selectedIds,
    toggleSelection,
    select,
    deselect,
    selectAll,
    clearSelection,
    toggleSelectAll,
    setSelection,
    isSelected,
    selectedItems,
    selectedCount,
    isAllSelected,
    isSomeSelected,
    hasSelection
  };
}

export default useBulkSelection;
