import React from 'react'

const shortcuts = [
  { key: 'j', description: 'Move down in list' },
  { key: 'k', description: 'Move up in list' },
  { key: 'a', description: 'Approve (advisor) / Confirm (accreditor)' },
  { key: 'g', description: 'Grow This (advisor)' },
  { key: 'f', description: 'Flag (accreditor)' },
  { key: 'm', description: 'Open merge modal (2+ selected)' },
  { key: 't', description: 'Toggle table/split-panel mode' },
  { key: 'Esc', description: 'Close modal / deselect' },
  { key: '?', description: 'Toggle this help overlay' },
]

const ShortcutHelp = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-2">
          {shortcuts.map(s => (
            <div key={s.key} className="flex items-center gap-3">
              <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 text-xs font-mono font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded">
                {s.key}
              </kbd>
              <span className="text-sm text-gray-600">{s.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ShortcutHelp
