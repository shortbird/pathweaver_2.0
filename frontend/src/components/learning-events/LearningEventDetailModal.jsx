import React from 'react';
import { XMarkIcon, CalendarIcon } from '@heroicons/react/24/outline';

const LearningEventDetailModal = ({ event, isOpen, onClose }) => {
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
          <div key={index} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-700 text-sm font-medium mb-2">
              <span>📝</span>
              <span>Text</span>
            </div>
            <p className="text-gray-800 whitespace-pre-wrap">{content.text}</p>
          </div>
        );

      case 'image':
        return (
          <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-700 text-sm font-medium mb-2">
              <span>📸</span>
              <span>Image</span>
            </div>
            {content.url && (
              <img
                src={content.url}
                alt={content.alt || 'Evidence image'}
                className="w-full rounded-lg border border-gray-200"
              />
            )}
            {content.caption && (
              <p className="text-gray-600 text-sm mt-2">{content.caption}</p>
            )}
          </div>
        );

      case 'video':
        return (
          <div key={index} className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-orange-700 text-sm font-medium mb-2">
              <span>🎥</span>
              <span>Video</span>
            </div>
            {content.title && (
              <p className="text-gray-800 font-medium mb-2">{content.title}</p>
            )}
            {content.url && (
              <a
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-600 hover:text-orange-700 underline break-all"
              >
                {content.url}
              </a>
            )}
          </div>
        );

      case 'link':
        return (
          <div key={index} className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-purple-700 text-sm font-medium mb-2">
              <span>🔗</span>
              <span>Web Link</span>
            </div>
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
                className="text-optio-purple hover:text-purple-700 underline break-all"
              >
                {content.url}
              </a>
            )}
          </div>
        );

      case 'document':
        return (
          <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-700 text-sm font-medium mb-2">
              <span>📄</span>
              <span>Document</span>
            </div>
            {content.title && (
              <p className="text-gray-800 font-medium mb-1">{content.title}</p>
            )}
            {content.filename && (
              <p className="text-gray-600 text-sm mb-2">{content.filename}</p>
            )}
            {content.url && (
              <a
                href={content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-primary text-white p-6 rounded-t-xl sticky top-0 z-10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">Learning Moment</h2>
              <div className="flex items-center gap-2 text-white/90 text-sm">
                <CalendarIcon className="w-4 h-4" />
                <span>{formatDate(event.created_at)}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Description */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
              {event.description}
            </p>
          </div>

          {/* Evidence Blocks */}
          {hasEvidence && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Evidence ({event.evidence_blocks.length} {event.evidence_blocks.length === 1 ? 'item' : 'items'})
              </h3>
              <div className="space-y-3">
                {event.evidence_blocks.map((block, index) => renderEvidenceBlock(block, index))}
              </div>
            </div>
          )}

          {!hasEvidence && (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>No evidence attached to this learning moment</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default LearningEventDetailModal;
