import React from 'react';
import { Modal } from '../../ui/Modal';

const EvidenceViewerModal = ({ isOpen, onClose, blockType, content }) => {
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={content.title || content.filename || `Evidence: ${blockType}`}
      size="lg"
      bodyClassName="p-4 sm:p-6 overflow-hidden flex-1"
    >
      <div className="h-full">
        {renderContent()}
      </div>
    </Modal>
  );
};

export default EvidenceViewerModal;
