import React from 'react';
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { useEvidenceEditor } from './EvidenceEditorContext';

// Standalone save status indicator component for use anywhere
export const SaveStatusIndicator = ({ saveStatus, lastSaved, size = 'sm' }) => {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const spinnerSizes = {
    sm: 'w-3 h-3 border',
    md: 'w-4 h-4 border-2',
    lg: 'w-5 h-5 border-2'
  };

  if (saveStatus === 'saving') {
    return (
      <div className={`flex items-center gap-2 ${sizeClasses[size]} text-gray-600`}>
        <div className={`${spinnerSizes[size]} border-optio-purple border-t-transparent rounded-full animate-spin`} />
        <span className="font-medium">Saving...</span>
      </div>
    );
  }

  if (saveStatus === 'saved') {
    const timeString = lastSaved
      ? lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    return (
      <div className={`flex items-center gap-2 ${sizeClasses[size]} text-green-600`}>
        <CheckCircleIcon className={iconSizes[size]} />
        <span className="font-medium">All changes saved</span>
        {timeString && <span className="text-gray-400">({timeString})</span>}
      </div>
    );
  }

  if (saveStatus === 'unsaved') {
    return (
      <div className={`flex items-center gap-2 ${sizeClasses[size]} text-amber-600`}>
        <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
        <span className="font-medium">Saving changes...</span>
      </div>
    );
  }

  if (saveStatus === 'error') {
    return (
      <div className={`flex items-center gap-2 ${sizeClasses[size]} text-red-600`}>
        <ExclamationCircleIcon className={iconSizes[size]} />
        <span className="font-medium">Save failed</span>
      </div>
    );
  }

  return null;
};

// Context-connected save status (for use within EvidenceEditorProvider)
export const ConnectedSaveStatus = ({ size = 'sm' }) => {
  const { saveStatus, lastSaved } = useEvidenceEditor();
  return <SaveStatusIndicator saveStatus={saveStatus} lastSaved={lastSaved} size={size} />;
};

export const EvidenceToolbar = ({ hideHeader }) => {
  const {
    saveStatus,
    lastSaved,
    documentStatus
  } = useEvidenceEditor();

  // When hideHeader is true, we don't render the toolbar but we still need
  // to provide the save status to the parent via context
  if (hideHeader) {
    return null;
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Evidence Document</h3>
          <SaveStatusIndicator saveStatus={saveStatus} lastSaved={lastSaved} size="sm" />
        </div>

        {documentStatus === 'completed' && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg">
            <CheckCircleIcon className="w-5 h-5" />
            <span className="font-medium">Task Completed</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default EvidenceToolbar;
