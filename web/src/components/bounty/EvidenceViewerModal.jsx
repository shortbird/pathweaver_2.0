import React from 'react'

const EvidenceViewerModal = ({ evidence, title, onClose, onDelete, deleting }) => {
  if (!evidence) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Evidence</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">{title}</p>
        <div className="space-y-3">
          {evidence.items.map((item, idx) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg relative group">
              {item.type === 'text' && (
                <p className="text-sm text-gray-700 whitespace-pre-line">{item.content?.text}</p>
              )}
              {(item.type === 'image' || (item.type === 'camera' && item.content?.items?.[0]?.mediaType === 'image')) && (
                <div>
                  {(item.content?.items || []).map((ci, j) => (
                    <img key={j} src={ci.url} alt={ci.caption || ''} className="rounded-lg max-h-64 w-auto" />
                  ))}
                </div>
              )}
              {(item.type === 'video' || (item.type === 'camera' && item.content?.items?.[0]?.mediaType === 'video')) && (
                <div>
                  {(item.content?.items || []).map((ci, j) => (
                    <video key={j} src={ci.url} controls className="rounded-lg max-h-64 w-full" />
                  ))}
                </div>
              )}
              {item.type === 'link' && (
                <div>
                  {(item.content?.items || []).map((ci, j) => (
                    <a key={j} href={ci.url} target="_blank" rel="noopener noreferrer" className="text-sm text-optio-purple underline break-all">
                      {ci.title || ci.url}
                    </a>
                  ))}
                </div>
              )}
              {item.type === 'document' && (
                <div>
                  {(item.content?.items || []).map((ci, j) => (
                    <a key={j} href={ci.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-optio-purple">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      {ci.title || ci.filename || 'Document'}
                    </a>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-gray-400 capitalize">{item.type}</span>
                {onDelete && (
                  <button
                    onClick={() => onDelete(idx)}
                    disabled={deleting}
                    className="text-xs text-red-400 hover:text-red-600 font-medium disabled:opacity-50 min-h-[28px]"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
          {evidence.items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No evidence uploaded yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default EvidenceViewerModal
