import React, { useState, useRef, useEffect } from 'react'
import { DIVIDER_STYLES } from './index'

/**
 * DividerBlockEditor - Simple divider with multiple style options
 * Styles: line (border), dots (centered ...), gradient (purple to pink)
 */
const DividerBlockEditor = ({ block, onUpdate }) => {
  const [showPicker, setShowPicker] = useState(false)
  const dropdownRef = useRef(null)

  const value = block.data?.style || 'line'
  const currentStyle = DIVIDER_STYLES[value] || DIVIDER_STYLES.line

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleStyleChange = (newStyle) => {
    onUpdate(block.id, {
      data: { ...block.data, style: newStyle }
    })
    setShowPicker(false)
  }

  const cycleStyle = () => {
    const styles = Object.keys(DIVIDER_STYLES)
    const currentIndex = styles.indexOf(value)
    const nextIndex = (currentIndex + 1) % styles.length
    handleStyleChange(styles[nextIndex])
  }

  const renderDividerPreview = (styleName) => {
    switch (styleName) {
      case 'line':
        return <div className="border-t border-gray-300 w-full" />
      case 'dots':
        return (
          <div className="text-center text-gray-400 text-2xl tracking-widest">
            • • •
          </div>
        )
      case 'gradient':
        return (
          <div
            className="h-[2px] w-full bg-gradient-to-r from-optio-purple via-optio-pink to-optio-purple"
            style={{ backgroundSize: '200% 100%' }}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="py-2">
      {/* Divider Preview - Click to Cycle */}
      <div
        onClick={cycleStyle}
        className="cursor-pointer py-4 px-8 hover:bg-gray-50 rounded transition-colors"
        title="Click to cycle through styles"
      >
        {renderDividerPreview(value)}
      </div>

      {/* Style Selector - Inline buttons instead of dropdown */}
      <div className="flex justify-center gap-2 mt-3">
        {Object.entries(DIVIDER_STYLES).map(([key, style]) => (
          <button
            key={key}
            type="button"
            onClick={() => handleStyleChange(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              value === key
                ? 'bg-optio-purple text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {style.name}
          </button>
        ))}
      </div>

      {/* Helper Text */}
      <div className="text-center mt-2 text-xs text-gray-400">
        Click divider to cycle, or select style above
      </div>
    </div>
  )
}

export default DividerBlockEditor
