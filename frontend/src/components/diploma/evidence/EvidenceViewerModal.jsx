import React from 'react';

const EvidenceViewerModal = ({ isOpen, onClose, blockType, content }) => {
  if (!isOpen) return null;

  const renderContent = () => {
    if (!content || (!content.url && !content.text)) {
      return <p className="text-gray-600">Content not available.</p>;
    }

    switch (blockType) {
      case 'link':
      case 'document':
        // For links and documents, embed in an iframe
        return (
          <iframe
            src={content.url}
            title={content.title || 'Evidence Document'}
            className="w-full h-full border-0 rounded-lg"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms" // Enhanced sandbox for security
          ></iframe>
        );
      case 'video':
        // For videos, embed in an iframe (e.g., YouTube, Vimeo)
        // Basic check for common video platforms, otherwise direct video link
        let videoSrc = content.url;
        if (videoSrc.includes('youtube.com') || videoSrc.includes('youtu.be')) {
          const videoId = videoSrc.split('v=')[1] || videoSrc.split('/').pop();
          videoSrc = `https://www.youtube.com/embed/${videoId}`;
        } else if (videoSrc.includes('vimeo.com')) {
          const videoId = videoSrc.split('/').pop();
          videoSrc = `https://player.vimeo.com/video/${videoId}`;
        }
        return (
          <iframe
            src={videoSrc}
            title={content.title || 'Evidence Video'}
            className="w-full h-full border-0 rounded-lg"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          ></iframe>
        );
      case 'text':
        // For text, display pre-formatted text
        return (
          <div className="p-4 bg-gray-50 rounded-lg overflow-auto h-full">
            <p className="whitespace-pre-wrap text-gray-800">{content.text}</p>
          </div>
        );
      default:
        return <p className="text-gray-600">Unsupported content type: {blockType}</p>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-[60]"> {/* Increased z-index */}
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full h-[90vh] flex flex-col relative">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-xl font-bold text-text-primary line-clamp-1">
            {content.title || content.filename || `Evidence: ${blockType}`}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-full hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-4 sm:p-6 overflow-hidden">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default EvidenceViewerModal;
