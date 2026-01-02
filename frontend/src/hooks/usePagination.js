/**
 * usePagination Hook
 *
 * Reusable pagination logic for lists and tables.
 *
 * Usage:
 *   const { page, setPage, totalPages, paginatedItems, pageInfo } = usePagination({
 *     items: users,
 *     itemsPerPage: 10
 *   });
 */

import { useState, useMemo, useCallback } from 'react';

export function usePagination({
  items = [],
  itemsPerPage = 10,
  initialPage = 1
}) {
  const [page, setPage] = useState(initialPage);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(items.length / itemsPerPage));
  }, [items.length, itemsPerPage]);

  // Ensure page is within valid range when items change
  const validPage = useMemo(() => {
    return Math.min(page, totalPages);
  }, [page, totalPages]);

  // Reset to first page if current page becomes invalid
  if (validPage !== page) {
    setPage(validPage);
  }

  const paginatedItems = useMemo(() => {
    const start = (validPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return items.slice(start, end);
  }, [items, validPage, itemsPerPage]);

  const pageInfo = useMemo(() => ({
    startIndex: (validPage - 1) * itemsPerPage + 1,
    endIndex: Math.min(validPage * itemsPerPage, items.length),
    totalItems: items.length
  }), [validPage, itemsPerPage, items.length]);

  const goToPage = useCallback((newPage) => {
    const clampedPage = Math.max(1, Math.min(newPage, totalPages));
    setPage(clampedPage);
  }, [totalPages]);

  const nextPage = useCallback(() => {
    if (validPage < totalPages) {
      setPage(validPage + 1);
    }
  }, [validPage, totalPages]);

  const prevPage = useCallback(() => {
    if (validPage > 1) {
      setPage(validPage - 1);
    }
  }, [validPage]);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  const canGoNext = validPage < totalPages;
  const canGoPrev = validPage > 1;

  return {
    page: validPage,
    setPage: goToPage,
    totalPages,
    paginatedItems,
    pageInfo,
    nextPage,
    prevPage,
    resetPage,
    canGoNext,
    canGoPrev,
    itemsPerPage
  };
}

export default usePagination;
