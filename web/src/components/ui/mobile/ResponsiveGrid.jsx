import React from 'react';

/**
 * ResponsiveGrid Component - Auto-adjusting grid that prevents horizontal overflow at 320px
 *
 * Replaces 82+ instances of hardcoded grid-cols-N without responsive breakpoints.
 * Uses CSS Grid with auto-fit and minmax() to automatically adjust columns based on available space.
 *
 * @param {React.ReactNode} children - Grid items
 * @param {number} minItemWidth - Minimum width for grid items in pixels (default: 280)
 * @param {number} maxColumns - Maximum number of columns (default: 4)
 * @param {string} gap - Gap size: 'sm' | 'md' | 'lg' (default: 'md')
 * @param {boolean} equalHeight - Make all items equal height (default: false)
 * @param {boolean} centerLastRow - Center items in last row if incomplete (default: false)
 * @param {string} className - Additional CSS classes
 */
export const ResponsiveGrid = ({
  children,
  minItemWidth = 280,
  maxColumns = 4,
  gap = 'md',
  equalHeight = false,
  centerLastRow = false,
  className = ''
}) => {
  const gaps = {
    sm: 'gap-3',
    md: 'gap-4',
    lg: 'gap-6'
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fit, minmax(min(${minItemWidth}px, 100%), 1fr))`,
    maxWidth: maxColumns ? `${(minItemWidth + (gap === 'sm' ? 12 : gap === 'md' ? 16 : 24)) * maxColumns}px` : 'none'
  };

  const containerClass = `
    ${gaps[gap]}
    ${equalHeight ? 'items-stretch' : ''}
    ${centerLastRow ? 'justify-items-center' : ''}
    ${className}
  `.trim();

  return (
    <div
      className={containerClass}
      style={gridStyle}
    >
      {children}
    </div>
  );
};

export default ResponsiveGrid;
