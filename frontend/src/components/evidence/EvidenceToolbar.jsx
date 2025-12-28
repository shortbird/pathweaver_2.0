import React from 'react';
import { useEvidenceEditor } from './EvidenceEditorContext';

export const EvidenceToolbar = ({ hideHeader }) => {
  const {
    saveStatus,
    lastSaved,
    documentStatus
  } = useEvidenceEditor();

  // Update parent container with save status when hideHeader is true
  React.useEffect(() => {
    if (hideHeader) {
      const container = document.getElementById('evidence-save-status');
      if (container) {
        // Clear existing content
        container.innerHTML = '';

        // Create save status elements
        if (saveStatus === 'saving') {
          container.innerHTML = `
            <div class="w-3 h-3 border-2 border-optio-purple border-t-transparent rounded-full animate-spin"></div>
            <span class="text-gray-600">Saving...</span>
          `;
        } else if (saveStatus === 'saved') {
          const timeString = lastSaved ? lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          container.innerHTML = `
            <svg class="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <span class="text-green-600">Saved ${timeString}</span>
          `;
        } else if (saveStatus === 'unsaved') {
          container.innerHTML = `
            <div class="w-2 h-2 bg-orange-400 rounded-full"></div>
            <span class="text-orange-600">Unsaved changes</span>
          `;
        }
      }
    }
  }, [hideHeader, saveStatus, lastSaved]);

  if (hideHeader) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Evidence Document</h3>
          <div className="flex items-center gap-2 text-sm">
            {saveStatus === 'saving' && (
              <>
                <div className="w-4 h-4 border-2 border-optio-purple border-t-transparent rounded-full animate-spin"></div>
                <span className="text-gray-600">Saving...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-green-600">Saved</span>
                {lastSaved && (
                  <span className="text-gray-500">
                    {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                <span className="text-orange-600">Unsaved changes</span>
              </>
            )}
          </div>
        </div>

        {documentStatus === 'completed' && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">Task Completed</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default EvidenceToolbar;
