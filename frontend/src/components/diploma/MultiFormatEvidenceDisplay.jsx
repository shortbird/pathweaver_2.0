import React, { useState } from 'react';
import EvidenceContentGrid from './evidence/EvidenceContentGrid';
import EvidenceLightbox from './evidence/EvidenceLightbox';
import EvidenceViewerModal from './evidence/EvidenceViewerModal';
import { useEvidenceLightbox } from '../../hooks/useEvidenceLightbox';
import { useExpandableContent } from '../../hooks/useExpandableContent';

const MultiFormatEvidenceDisplay = ({ blocks = [] }) => {
  const [viewerContent, setViewerContent] = useState(null);
  // Sort blocks by order_index
  const sortedBlocks = blocks
    .filter(block => block && block.block_type && block.content)
    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  if (!sortedBlocks || sortedBlocks.length === 0) {
    return (
      <div className="p-6 rounded-lg bg-gray-50 border border-gray-200 text-center">
        <div className="w-12 h-12 mx-auto mb-3 bg-gray-200 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-sm text-gray-500">No evidence content available</p>
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

  return (
    <>
      {/* Evidence summary header */}
      <div className="mb-6 p-4 bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 border border-[#6d469b]/15 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-[#6d469b]">Learning Evidence</h4>
              <p className="text-sm text-gray-600">Comprehensive documentation of learning progress</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-[#6d469b]">{sortedBlocks.length}</div>
            <div className="text-xs text-gray-600">
              {sortedBlocks.length === 1 ? 'Item' : 'Items'}
            </div>
          </div>
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