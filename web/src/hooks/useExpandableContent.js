import { useState, useCallback } from 'react';

export const useExpandableContent = (initialExpanded = new Set()) => {
  const [expandedBlocks, setExpandedBlocks] = useState(initialExpanded);

  const toggleExpanded = useCallback((blockId) => {
    setExpandedBlocks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(blockId)) {
        newSet.delete(blockId);
      } else {
        newSet.add(blockId);
      }
      return newSet;
    });
  }, []);

  const expandBlock = useCallback((blockId) => {
    setExpandedBlocks(prev => new Set(prev).add(blockId));
  }, []);

  const collapseBlock = useCallback((blockId) => {
    setExpandedBlocks(prev => {
      const newSet = new Set(prev);
      newSet.delete(blockId);
      return newSet;
    });
  }, []);

  const expandAll = useCallback((blockIds) => {
    setExpandedBlocks(new Set(blockIds));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedBlocks(new Set());
  }, []);

  const isExpanded = useCallback((blockId) => {
    return expandedBlocks.has(blockId);
  }, [expandedBlocks]);

  return {
    expandedBlocks,
    toggleExpanded,
    expandBlock,
    collapseBlock,
    expandAll,
    collapseAll,
    isExpanded
  };
};