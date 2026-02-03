import React, { memo, useState, useMemo } from 'react';
import { Card } from '../Card';
import TouchActionButton from './TouchActionButton';

/**
 * ResponsiveTable - Adaptive table component
 * Desktop (md+): Standard HTML table with sticky columns
 * Mobile (<md): Stacked cards for better touch interaction
 *
 * @param {Array} data - Array of data objects to display
 * @param {Array} columns - Column definitions with:
 *   - key: Data object key to display
 *   - header: Column header text
 *   - render: Optional custom render function (value, row, index)
 *   - sortable: Enable column sorting (default: false)
 *   - sticky: Make column sticky on desktop (default: false)
 *   - hideOnMobile: Hide this field in mobile cards (default: false)
 *   - mobileOrder: Order in mobile card (lower = higher, default: 100)
 *   - mobileLabel: Custom label for mobile (default: header)
 * @param {function} keyExtractor - Function to extract unique key from row (default: (row, idx) => row.id || idx)
 * @param {function} mobileCardRenderer - Custom mobile card renderer (row, index, actions) => ReactNode
 * @param {string} mobileBreakpoint - Tailwind breakpoint for mobile/desktop (default: 'md')
 * @param {function} actions - Function returning array of action buttons: (row) => [{ icon, label, onClick, variant, requiresConfirm }]
 * @param {Array} bulkActions - Bulk actions when rows selected: [{ icon, label, onClick, variant, requiresConfirm }]
 * @param {boolean} selectable - Enable row selection checkboxes (default: false)
 * @param {Set} selectedIds - Set of selected row IDs
 * @param {function} onSelectionChange - Callback when selection changes (selectedSet)
 * @param {object} pagination - Pagination config: { currentPage, totalPages, onPageChange }
 * @param {boolean} loading - Show loading state (default: false)
 * @param {string} emptyMessage - Message when no data (default: 'No data available')
 * @param {string} className - Additional CSS classes
 */
const ResponsiveTable = ({
  data = [],
  columns = [],
  keyExtractor = (row, idx) => row.id || idx,
  mobileCardRenderer,
  mobileBreakpoint = 'md',
  actions,
  bulkActions,
  selectable = false,
  selectedIds,
  onSelectionChange,
  pagination,
  loading = false,
  emptyMessage = 'No data available',
  className = ''
}) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Handle row selection
  const handleSelectAll = (e) => {
    if (!onSelectionChange) return;

    if (e.target.checked) {
      const allIds = new Set(data.map((row, idx) => keyExtractor(row, idx)));
      onSelectionChange(allIds);
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleSelectRow = (rowKey) => {
    if (!onSelectionChange) return;

    const newSelection = new Set(selectedIds);
    if (newSelection.has(rowKey)) {
      newSelection.delete(rowKey);
    } else {
      newSelection.add(rowKey);
    }
    onSelectionChange(newSelection);
  };

  // Handle sorting
  const handleSort = (columnKey) => {
    const column = columns.find(col => col.key === columnKey);
    if (!column?.sortable) return;

    setSortConfig(prev => ({
      key: columnKey,
      direction: prev.key === columnKey && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [data, sortConfig]);

  // Sort columns by mobileOrder for mobile view
  const mobileColumns = useMemo(() => {
    return [...columns]
      .filter(col => !col.hideOnMobile)
      .sort((a, b) => (a.mobileOrder || 100) - (b.mobileOrder || 100));
  }, [columns]);

  // Render loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  // Render empty state
  if (data.length === 0) {
    return (
      <Card variant="outlined" className={className}>
        <div className="text-center py-12 text-gray-500">
          {emptyMessage}
        </div>
      </Card>
    );
  }

  // Desktop table view
  const DesktopTable = () => (
    <div className={`hidden ${mobileBreakpoint}:block overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {selectable && (
              <th className="px-6 py-3 text-left">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple min-h-[20px] min-w-[20px]"
                  checked={selectedIds?.size === data.length && data.length > 0}
                  onChange={handleSelectAll}
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                  col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                } ${col.sticky ? 'sticky left-0 bg-gray-50 z-10' : ''}`}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <div className="flex items-center gap-2">
                  {col.header}
                  {col.sortable && sortConfig.key === col.key && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            ))}
            {actions && <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedData.map((row, idx) => {
            const rowKey = keyExtractor(row, idx);
            const rowActions = actions ? actions(row) : [];
            const isSelected = selectedIds?.has(rowKey);

            return (
              <tr key={rowKey} className={`group hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                {selectable && (
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple min-h-[20px] min-w-[20px]"
                      checked={isSelected}
                      onChange={() => handleSelectRow(rowKey)}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-6 py-4 text-sm text-gray-900 ${col.sticky ? 'sticky left-0 bg-white group-hover:bg-gray-50 z-10' : ''}`}
                  >
                    {col.render ? col.render(row[col.key], row, idx) : row[col.key]}
                  </td>
                ))}
                {actions && (
                  <td className="px-6 py-4 text-right">
                    <div className="flex gap-2 justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {rowActions.map((action, actionIdx) => (
                        <TouchActionButton
                          key={actionIdx}
                          icon={action.icon}
                          label={action.label}
                          onClick={action.onClick}
                          variant={action.variant || 'ghost'}
                          size={action.size || 'sm'}
                          requiresConfirm={action.requiresConfirm}
                          disabled={action.disabled}
                          loading={action.loading}
                        />
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // Mobile card view
  const MobileCards = () => (
    <div className={`${mobileBreakpoint}:hidden space-y-4 ${className}`}>
      {sortedData.map((row, idx) => {
        const rowKey = keyExtractor(row, idx);
        const rowActions = actions ? actions(row) : [];
        const isSelected = selectedIds?.has(rowKey);

        // Use custom renderer if provided
        if (mobileCardRenderer) {
          return (
            <Card key={rowKey} variant="outlined" padding="md" className={isSelected ? 'ring-2 ring-optio-purple' : ''}>
              {mobileCardRenderer(row, idx, rowActions)}
            </Card>
          );
        }

        // Default card renderer
        return (
          <Card key={rowKey} variant="outlined" padding="md" className={isSelected ? 'ring-2 ring-optio-purple' : ''}>
            {selectable && (
              <div className="mb-4 pb-4 border-b border-gray-200">
                <label className="flex items-center gap-2 min-h-[44px]">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple min-h-[24px] min-w-[24px]"
                    checked={isSelected}
                    onChange={() => handleSelectRow(rowKey)}
                  />
                  <span className="text-sm text-gray-600">Select</span>
                </label>
              </div>
            )}

            <div className="space-y-3">
              {mobileColumns.map((col) => {
                const value = row[col.key];
                const label = col.mobileLabel || col.header;

                return (
                  <div key={col.key} className="flex flex-col">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      {label}
                    </span>
                    <span className="text-sm text-gray-900">
                      {col.render ? col.render(value, row, idx) : value}
                    </span>
                  </div>
                );
              })}
            </div>

            {rowActions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2 flex-wrap">
                {rowActions.map((action, actionIdx) => (
                  <TouchActionButton
                    key={actionIdx}
                    icon={action.icon}
                    label={action.label}
                    onClick={action.onClick}
                    variant={action.variant || 'ghost'}
                    size={action.size || 'sm'}
                    requiresConfirm={action.requiresConfirm}
                    disabled={action.disabled}
                    loading={action.loading}
                  />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );

  // Pagination controls
  const Pagination = () => {
    if (!pagination) return null;

    const { currentPage, totalPages, onPageChange } = pagination;

    return (
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 sm:px-6">
        <div className="flex justify-between sm:hidden w-full">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            Previous
          </button>
          <span className="text-sm text-gray-700 flex items-center">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            Next
          </button>
        </div>
        <div className="hidden sm:flex sm:items-center sm:justify-between w-full">
          <div>
            <p className="text-sm text-gray-700">
              Page <span className="font-medium">{currentPage}</span> of{' '}
              <span className="font-medium">{totalPages}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Bulk actions toolbar
  const BulkActionsToolbar = () => {
    if (!bulkActions || !selectedIds?.size) return null;

    return (
      <div className="bg-blue-50 border-b border-blue-200 px-4 py-3 flex items-center justify-between gap-4">
        <span className="text-sm text-blue-900 font-medium">
          {selectedIds.size} item{selectedIds.size !== 1 ? 's' : ''} selected
        </span>
        <div className="flex gap-2 flex-wrap">
          {bulkActions.map((action, idx) => (
            <TouchActionButton
              key={idx}
              icon={action.icon}
              label={action.label}
              onClick={action.onClick}
              variant={action.variant || 'secondary'}
              size={action.size || 'sm'}
              requiresConfirm={action.requiresConfirm}
              disabled={action.disabled}
              loading={action.loading}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <BulkActionsToolbar />
      <DesktopTable />
      <MobileCards />
      <Pagination />
    </div>
  );
};

export default memo(ResponsiveTable);
