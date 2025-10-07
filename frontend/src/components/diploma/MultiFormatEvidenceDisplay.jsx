import React, { useState } from 'react';
import EvidenceContentGrid from './evidence/EvidenceContentGrid';
import EvidenceLightbox from './evidence/EvidenceLightbox';
import EvidenceViewerModal from './evidence/EvidenceViewerModal';
import { useEvidenceLightbox } from '../../hooks/useEvidenceLightbox';
import { useExpandableContent } from '../../hooks/useExpandableContent';

const MultiFormatEvidenceDisplay = ({ blocks = [] }) => {
  const [viewerContent, setViewerContent] = useState(null);

  // Debug logging

  // Sort blocks by order_index
  const sortedBlocks = blocks
    .filter(block => {
      if (!block) {
        console.warn('Null or undefined block found');
        return false;
      }
      if (!block.block_type) {
        console.warn('Block missing block_type:', block);
        return false;
      }
      if (!block.content) {
        console.warn('Block missing content:', block);
        return false;
      }
      return true;
    })
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));


  if (!sortedBlocks || sortedBlocks.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center shadow-inner">
          <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h4 className="text-lg font-semibold text-gray-700 mb-2">No Evidence Content</h4>
        <p className="text-sm text-gray-600">
          This evidence document is empty or the content could not be loaded.
        </p>
      </div>
    );
  }

  // Extract images for lightbox
  const imageBlocks = sortedBlocks.filter(block => block.block_type === 'image');

  // Initialize hooks
  const {
    isOpen: lightboxOpen,
    currentIndex: lightboxIndex,
    openLightbox,
    closeLightbox,
    goToNext,
    goToPrevious
  } = useEvidenceLightbox(imageBlocks);

  const { expandedBlocks, toggleExpanded } = useExpandableContent();

  // Handle image click from grid
  const handleImageClick = (image, index, images) => {
    openLightbox(image, index, images);
  };

  const handleOpenContent = (block) => {
    setViewerContent(block);
  };

  // Handle expand toggle from grid
  const handleExpandToggle = (blockId) => {
    toggleExpanded(blockId);
  };

  // Count evidence types for summary
  const evidenceTypeCounts = sortedBlocks.reduce((counts, block) => {
    const type = block.block_type;
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});

  const getTypeIcon = (type) => {
    switch(type) {
      case 'image': return '🖼️';
      case 'text': return '📝';
      case 'link': return '🔗';
      case 'video': return '🎥';
      case 'document': return '📄';
      default: return '📌';
    }
  };

  const getTypeName = (type) => {
    switch(type) {
      case 'image': return 'Image';
      case 'text': return 'Text';
      case 'link': return 'Link';
      case 'video': return 'Video';
      case 'document': return 'Document';
      default: return 'Item';
    }
  };

  return (
    <>
      {/* Beautiful evidence summary header */}
      <div className="mb-6 p-6 bg-gradient-to-br from-[#ef597b]/8 to-[#6d469b]/8 border-2 border-[#6d469b]/20 rounded-xl shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-4 flex-1">
            <div className="w-14 h-14 bg-gradient-to-br from-[#ef597b] to-[#6d469b] rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-lg font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent mb-1">
                Learning Evidence Portfolio
              </h4>
              <p className="text-sm text-gray-700">
                Comprehensive documentation showcasing the learning journey
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold bg-gradient-to-r from-[#ef597b] to-[#6d469b] bg-clip-text text-transparent">
              {sortedBlocks.length}
            </div>
            <div className="text-xs font-medium text-gray-600">
              {sortedBlocks.length === 1 ? 'Item' : 'Items'}
            </div>
          </div>
        </div>

        {/* Evidence type breakdown */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-[#6d469b]/15">
          {Object.entries(evidenceTypeCounts).map(([type, count]) => (
            <div
              key={type}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/60 backdrop-blur-sm rounded-full border border-[#6d469b]/20"
            >
              <span className="text-sm">{getTypeIcon(type)}</span>
              <span className="text-xs font-medium text-gray-700">
                {count} {getTypeName(type)}{count !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main evidence grid */}
      <EvidenceContentGrid
        blocks={sortedBlocks}
        onImageClick={handleImageClick}
        onExpandToggle={handleExpandToggle}
        expandedBlocks={expandedBlocks}
        onOpenContent={handleOpenContent}
      />

      {/* Lightbox for images */}
      <EvidenceLightbox
        isOpen={lightboxOpen}
        images={imageBlocks}
        currentIndex={lightboxIndex}
        onClose={closeLightbox}
        onNext={goToNext}
        onPrevious={goToPrevious}
      />

      {/* Viewer for other content types */}
      <EvidenceViewerModal
        isOpen={!!viewerContent}
        onClose={() => setViewerContent(null)}
        blockType={viewerContent?.block_type}
        content={viewerContent?.content}
      />
    </>
  );
};

export default MultiFormatEvidenceDisplay;