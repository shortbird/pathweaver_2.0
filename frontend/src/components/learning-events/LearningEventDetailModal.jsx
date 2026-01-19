import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, CalendarIcon, PencilIcon, PlusIcon } from '@heroicons/react/24/outline';
import LearningEventModal from './LearningEventModal';

const LearningEventDetailModal = ({ event, isOpen, onClose, onUpdate }) => {
  const [showEditModal, setShowEditModal] = useState(false);

  if (!isOpen || !event) return null;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const renderEvidenceBlock = (block, index) => {
    const { block_type, content } = block;

    switch (block_type) {
      case 'text':
        return (
          <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Note</p>
            <p className="text-gray-800 whitespace-pre-wrap">{content.text}</p>
          </div>
        );

      case 'image':
        return (
          <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Image</p>
            {content.url && (
              <img
                src={content.url}
                alt={content.alt || 'Evidence image'}
                className="w-full rounded-lg"
              />
            )}
            {content.caption && (
              <p className="text-gray-600 text-sm mt-2">{content.caption}</p>
            )}
          </div>
        );

      case 'video':
        return (
          <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Video</p>
            {content.title && (
              <p className="text-gray-800 font-medium mb-2">{content.title}</p>
            )}
            {content.url && (
              <a
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-optio-purple hover:underline break-all text-sm"
              >
                {content.url}
              </a>
            )}
          </div>
        );

      case 'link':
        return (
          <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Link</p>
            {content.title && (
              <p className="text-gray-800 font-medium mb-1">{content.title}</p>
            )}
            {content.description && (
              <p className="text-gray-600 text-sm mb-2">{content.description}</p>
            )}
            {content.url && (
              <a
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-optio-purple hover:underline break-all text-sm"
              >
                {content.url}
              </a>
            )}
          </div>
        );

      case 'document':
        return (
          <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Document</p>
            {content.filename && (
              <p className="text-gray-800 font-medium mb-2">{content.filename}</p>
            )}
            {content.url && (
              <a
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
              >
                Download
              </a>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const hasEvidence = event.evidence_blocks && event.evidence_blocks.length > 0;

  const handleEditSuccess = (updatedEvent) => {
    setShowEditModal(false);
    if (onUpdate) {
      onUpdate(updatedEvent);
    }
    onClose();
  };

  const modalContent = (
    <>
      <div
        className="fixed top-0 left-0 right-0 bottom-0 bg-black/50 flex items-center justify-center p-4"
        style={{ zIndex: 9999 }}
      >
        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white p-6 rounded-t-xl sticky top-0">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold mb-1">Learning Moment</h2>
                <div className="flex items-center gap-2 text-white/80 text-sm">
                  <CalendarIcon className="w-4 h-4" />
                  <span>{formatDate(event.created_at)}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Title if exists */}
            {event.title && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Title</p>
                <p className="text-lg font-semibold text-gray-900">{event.title}</p>
              </div>
            )}

            {/* Description */}
            <div className="mb-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Description</p>
              <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                {event.description}
              </p>
            </div>

            {/* Pillars */}
            {event.pillars && event.pillars.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Pillars</p>
                <div className="flex flex-wrap gap-2">
                  {event.pillars.map((pillar) => (
                    <span
                      key={pillar}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium"
                    >
                      {pillar.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence Blocks */}
            {hasEvidence && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                  Evidence ({event.evidence_blocks.length})
                </p>
                <div className="space-y-3">
                  {event.evidence_blocks.map((block, index) => renderEvidenceBlock(block, index))}
                </div>
              </div>
            )}

            {!hasEvidence && (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                <p className="text-gray-500 text-sm">No evidence attached yet</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Close
              </button>
              <button
                onClick={() => setShowEditModal(true)}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-colors font-medium flex items-center justify-center gap-2"
              >
                {hasEvidence ? (
                  <>
                    <PencilIcon className="w-4 h-4" />
                    Edit
                  </>
                ) : (
                  <>
                    <PlusIcon className="w-4 h-4" />
                    Add Evidence
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <LearningEventModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={handleEditSuccess}
        editEvent={event}
      />
    </>
  );

  return createPortal(modalContent, document.body);
};

export default LearningEventDetailModal;
