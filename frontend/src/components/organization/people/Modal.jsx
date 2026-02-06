import React from 'react'
import { createPortal } from 'react-dom'
import { XMarkIcon } from '@heroicons/react/24/outline'

/**
 * Generic modal component with portal rendering.
 * Used for consistent modal styling across the People tab.
 */
const Modal = ({ title, children, onClose, onConfirm, confirmText, confirmClass }) => {
  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
        {onConfirm && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium">
              Cancel
            </button>
            <button onClick={onConfirm} className={`px-4 py-2 text-white rounded-lg transition-colors font-semibold ${confirmClass}`}>
              {confirmText}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default Modal
