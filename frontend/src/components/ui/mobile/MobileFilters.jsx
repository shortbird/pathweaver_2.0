import React, { useState } from 'react';

/**
 * MobileFilters Component - Collapsible filter panel with mobile FAB + drawer
 *
 * Shows as floating FAB + slide-up drawer on mobile, inline filters on desktop.
 * Replaces inline filter patterns in AdminUsers.jsx and other admin components.
 *
 * @param {Array} filters - Array of FilterConfig: { key, type, label, options, placeholder }
 *   - type: 'select' | 'search' | 'date' | 'checkbox'
 * @param {Object} values - Current filter values (key-value pairs)
 * @param {Function} onChange - Called when filter value changes: (key, value) => void
 * @param {Function} onReset - Called when filters are reset
 * @param {string} mobileBreakpoint - Tailwind breakpoint: 'sm' | 'md' | 'lg' (default: 'md')
 * @param {string} floatingButtonPosition - FAB position: 'bottom-right' | 'bottom-left' (default: 'bottom-right')
 * @param {number} activeFilterCount - Number of active filters (shown as badge on FAB)
 * @param {number} resultCount - Number of results (shown in drawer header)
 * @param {string} desktopLayout - Desktop layout: 'inline' | 'collapsible' (default: 'inline')
 * @param {number} desktopColumns - Number of columns in desktop layout (default: 3)
 * @param {string} className - Additional CSS classes
 */
export const MobileFilters = ({
  filters = [],
  values = {},
  onChange,
  onReset,
  mobileBreakpoint = 'md',
  floatingButtonPosition = 'bottom-right',
  activeFilterCount = 0,
  resultCount,
  desktopLayout = 'inline',
  desktopColumns = 3,
  className = ''
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const breakpoints = {
    sm: 'sm',
    md: 'md',
    lg: 'lg'
  };

  const bp = breakpoints[mobileBreakpoint] || 'md';

  const handleChange = (key, value) => {
    if (onChange) {
      onChange(key, value);
    }
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    }
    setIsDrawerOpen(false);
  };

  const handleApply = () => {
    setIsDrawerOpen(false);
  };

  const fabPosition = floatingButtonPosition === 'bottom-left'
    ? 'left-4'
    : 'right-4';

  const renderFilter = (filter) => {
    const value = values[filter.key] || '';

    switch (filter.type) {
      case 'select':
        return (
          <div key={filter.key} className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {filter.label}
            </label>
            <select
              value={value}
              onChange={(e) => handleChange(filter.key, e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            >
              <option value="">{filter.placeholder || 'All'}</option>
              {filter.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );

      case 'search':
        return (
          <div key={filter.key} className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {filter.label}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => handleChange(filter.key, e.target.value)}
              placeholder={filter.placeholder || 'Search...'}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>
        );

      case 'date':
        return (
          <div key={filter.key} className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              {filter.label}
            </label>
            <input
              type="date"
              value={value}
              onChange={(e) => handleChange(filter.key, e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
            />
          </div>
        );

      case 'checkbox':
        return (
          <div key={filter.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={filter.key}
              checked={!!value}
              onChange={(e) => handleChange(filter.key, e.target.checked)}
              className="w-4 h-4 text-optio-purple border-gray-300 rounded focus:ring-optio-purple"
            />
            <label htmlFor={filter.key} className="text-sm font-medium text-gray-700">
              {filter.label}
            </label>
          </div>
        );

      default:
        return null;
    }
  };

  const desktopGridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6'
  };

  return (
    <>
      {/* Desktop Filters */}
      <div className={`hidden ${bp}:block ${className}`}>
        <div className={`grid ${desktopGridCols[desktopColumns]} gap-4`}>
          {filters.map(renderFilter)}
        </div>
        {onReset && (
          <button
            onClick={handleReset}
            className="mt-4 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => setIsDrawerOpen(true)}
        className={`${bp}:hidden fixed bottom-4 ${fabPosition} z-40 w-14 h-14 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-95`}
        aria-label="Open filters"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        {activeFilterCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Mobile Drawer */}
      {isDrawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className={`${bp}:hidden fixed inset-0 bg-black bg-opacity-50 z-50`}
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Drawer */}
          <div
            className={`${bp}:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* Drawer Handle */}
            <div className="flex justify-center py-3 border-b border-gray-200">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Drawer Header */}
            <div className="px-4 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Filters</h3>
              {resultCount !== undefined && (
                <p className="text-sm text-gray-600 mt-1">
                  {resultCount} result{resultCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="flex flex-col gap-4">
                {filters.map(renderFilter)}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="px-4 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleReset}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleApply}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default MobileFilters;
