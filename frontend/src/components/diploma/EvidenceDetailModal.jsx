import React, { useState } from 'react';
import UnifiedEvidenceDisplay from '../evidence/UnifiedEvidenceDisplay';
import { getPillarGradient, getPillarDisplayName } from '../../config/pillars';
import { evidenceAPI } from '../../services/api';
import { TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const EvidenceDetailModal = ({ isOpen, onClose, evidenceItem, onDelete }) => {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isOpen || !evidenceItem) return null;

  const blockId = evidenceItem.block?.id;
  const canDelete = !!onDelete && !!blockId;

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleDelete = async () => {
    if (!blockId) return;
    setDeleting(true);
    try {
      await evidenceAPI.deleteBlock(blockId);
      toast.success('Evidence deleted');
      onDelete(evidenceItem);
      onClose();
    } catch (err) {
      console.error('Failed to delete evidence:', err);
      toast.error(err.response?.data?.error || 'Failed to delete evidence');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      role="button"
      tabIndex="0"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClose();
        }
      }}
      aria-label="Close evidence detail modal"
    >
      <div
        className="bg-white rounded-xl max-w-full sm:max-w-3xl mx-2 sm:mx-0 w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Evidence Details"
      >
        <div className={`sticky top-0 p-6 bg-gradient-to-r ${getPillarGradient(evidenceItem.pillar)} z-10`}>
          <div className="flex justify-between items-center">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-white mb-1 truncate">{evidenceItem.questTitle}</h2>
              <p className="text-white/90 text-sm truncate">{evidenceItem.taskTitle}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors flex-shrink-0 ml-4 min-h-[44px] min-w-[44px]"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-medium">
              {getPillarDisplayName(evidenceItem.pillar)}
            </span>
            <span className="text-white/90 text-sm">
              +{evidenceItem.xpAwarded} XP
            </span>
            <span className="text-white/80 text-sm">
              {formatDate(evidenceItem.completedAt)}
            </span>
          </div>
        </div>

        <div className="p-6">
          <UnifiedEvidenceDisplay
            evidence={evidenceItem.evidence}
            displayMode="full"
          />
        </div>

        {/* Delete button for student's own evidence */}
        {canDelete && (
          <div className="border-t border-gray-200 px-6 py-4">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-600 transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
                Delete this evidence
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-sm text-red-600 font-medium">
                  Delete this evidence permanently?
                </p>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleting ? 'Deleting...' : 'Yes, delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EvidenceDetailModal;
