import React from 'react';

const EvidenceContentGrid = ({ blocks = [], onImageClick, onExpandToggle, expandedBlocks = new Set() }) => {
  // Group blocks by type for better organization
  const groupedBlocks = blocks.reduce((groups, block) => {
    const type = block.block_type;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(block);
    return groups;
  }, {});

  // Determine grid layout based on content type and count
  const getGridClasses = (type, count) => {
    switch (type) {
      case 'image':
        if (count === 1) return 'grid-cols-1';
        if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
      case 'text':
        return 'grid-cols-1';
      default:
        return 'grid-cols-1 sm:grid-cols-2';
    }
  };

  // Render image gallery section
  const renderImageSection = (images) => (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
        <svg className="w-4 h-4 mr-2 text-[#6d469b]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
        Visual Evidence ({images.length})
      </h4>
      <div className={`grid gap-3 ${getGridClasses('image', images.length)}`}>
        {images.map((block, index) => (
          <div
            key={block.id}
            className="group relative overflow-hidden rounded-lg bg-gradient-to-br from-[#ef597b]/5 to-[#6d469b]/5 border border-[#6d469b]/10 cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
            onClick={() => onImageClick && onImageClick(block, index, images)}
          >
            <div className="aspect-video relative overflow-hidden">
              <img
                src={block.content.url}
                alt={block.content.alt || 'Task evidence'}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-2 right-2">
                  <div className="bg-white/90 backdrop-blur-sm rounded-full p-2">
                    <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            {block.content.caption && (
              <div className="p-3">
                <p className="text-xs text-gray-600 line-clamp-2">{block.content.caption}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // Render text content section
  const renderTextSection = (textBlocks) => (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
        <svg className="w-4 h-4 mr-2 text-[#6d469b]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
        </svg>
        Written Reflections ({textBlocks.length})
      </h4>
      <div className="space-y-3">
        {textBlocks.map((block) => {
          const isExpanded = expandedBlocks.has(block.id);
          const textLength = block.content.text?.length || 0;
          const shouldTruncate = textLength > 300;

          return (
            <div
              key={block.id}
              className="bg-gradient-to-br from-[#ef597b]/3 to-[#6d469b]/3 border border-[#6d469b]/15 rounded-lg p-4"
            >
              <div className={`text-sm text-gray-700 leading-relaxed ${shouldTruncate && !isExpanded ? 'line-clamp-4' : ''}`}>
                <p className="whitespace-pre-wrap">{block.content.text}</p>
              </div>
              {shouldTruncate && (
                <button
                  onClick={() => onExpandToggle && onExpandToggle(block.id)}
                  className="mt-3 text-[#6d469b] hover:text-[#ef597b] font-medium text-sm transition-colors"
                >
                  {isExpanded ? 'Show Less' : 'Read More'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // Render resource links section
  const renderResourceSection = (resources) => (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
        <svg className="w-4 h-4 mr-2 text-[#6d469b]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5z" clipRule="evenodd" />
        </svg>
        Resources & Links ({resources.length})
      </h4>
      <div className={`grid gap-3 ${getGridClasses('link', resources.length)}`}>
        {resources.map((block) => {
          const rawUrl = block.content.url;
          console.log('Multi-format evidence URL debug:', { blockId: block.id, rawUrl, content: block.content });

          if (!rawUrl || rawUrl === '' || rawUrl === 'undefined' || rawUrl === 'null') {
            return (
              <div key={block.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Link not available</p>
              </div>
            );
          }

          // More robust URL validation and formatting
          let formattedUrl = rawUrl.trim();

          // Check if it's a valid URL pattern
          if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
            // Try to detect if it looks like a domain/URL
            if (formattedUrl.includes('.') || formattedUrl.startsWith('www.')) {
              formattedUrl = `https://${formattedUrl}`;
            } else {
              // If it doesn't look like a URL, show error
              return (
                <div key={block.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-gray-500 text-sm">Invalid link format: {rawUrl}</p>
                </div>
              );
            }
          }

          // Final validation - try to construct URL
          let hostname = 'External Link';
          try {
            const urlObj = new URL(formattedUrl);
            hostname = urlObj.hostname;
            // Additional validation - make sure it's not empty or invalid
            if (!hostname || hostname === 'undefined' || hostname === 'null') {
              throw new Error('Invalid hostname');
            }
          } catch (error) {
            console.warn('Invalid URL after formatting:', formattedUrl, error);
            return (
              <div key={block.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Invalid URL format</p>
              </div>
            );
          }

          const handleLinkClick = (e) => {
            e.preventDefault();
            console.log('Opening URL:', formattedUrl);
            try {
              window.open(formattedUrl, '_blank', 'noopener,noreferrer');
            } catch (error) {
              console.error('Failed to open URL:', formattedUrl, error);
              // Fallback to direct assignment
              window.open(formattedUrl, '_blank');
            }
          };

          return (
            <a
              key={block.id}
              href={formattedUrl}
              onClick={handleLinkClick}
              className="group bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-[#6d469b]/30 transition-all duration-300 cursor-pointer"
            >
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="font-medium text-gray-900 group-hover:text-[#6d469b] transition-colors line-clamp-1">
                    {block.content.title || 'External Resource'}
                  </h5>
                  {block.content.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{block.content.description}</p>
                  )}
                  <div className="flex items-center mt-2 text-xs text-gray-500">
                    <span className="truncate">{hostname}</span>
                    <svg className="w-3 h-3 ml-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                    </svg>
                  </div>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );

  // Render document section
  const renderDocumentSection = (documents) => (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
        <svg className="w-4 h-4 mr-2 text-[#6d469b]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
        Documents ({documents.length})
      </h4>
      <div className={`grid gap-3 ${getGridClasses('document', documents.length)}`}>
        {documents.map((block) => {
          const rawUrl = block.content.url;
          console.log('Multi-format document URL debug:', { blockId: block.id, rawUrl, content: block.content });

          if (!rawUrl || rawUrl === '' || rawUrl === 'undefined' || rawUrl === 'null') {
            return (
              <div key={block.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Document not available</p>
              </div>
            );
          }

          // More robust URL validation and formatting
          let formattedUrl = rawUrl.trim();

          // Check if it's a valid URL pattern
          if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
            // Try to detect if it looks like a domain/URL
            if (formattedUrl.includes('.') || formattedUrl.startsWith('www.')) {
              formattedUrl = `https://${formattedUrl}`;
            } else {
              // If it doesn't look like a URL, show error
              return (
                <div key={block.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-gray-500 text-sm">Invalid document format: {rawUrl}</p>
                </div>
              );
            }
          }

          // Final validation - try to construct URL
          try {
            new URL(formattedUrl);
          } catch (error) {
            console.warn('Invalid document URL after formatting:', formattedUrl, error);
            return (
              <div key={block.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Invalid document URL format</p>
              </div>
            );
          }

          const handleDocumentClick = (e) => {
            e.preventDefault();
            console.log('Opening document URL:', formattedUrl);
            try {
              window.open(formattedUrl, '_blank', 'noopener,noreferrer');
            } catch (error) {
              console.error('Failed to open document URL:', formattedUrl, error);
              window.open(formattedUrl, '_blank');
            }
          };

          return (
            <a
              key={block.id}
              href={formattedUrl}
              onClick={handleDocumentClick}
              className="group bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-[#6d469b]/30 transition-all duration-300 cursor-pointer"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-gray-400 to-gray-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="font-medium text-gray-900 group-hover:text-[#6d469b] transition-colors line-clamp-1">
                    {block.content.title || block.content.filename || 'Document'}
                  </h5>
                  <p className="text-sm text-gray-600 mt-1">Click to view document</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 group-hover:text-[#6d469b] transition-colors" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                </svg>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );

  // Render video section
  const renderVideoSection = (videos) => (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
        <svg className="w-4 h-4 mr-2 text-[#6d469b]" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
        </svg>
        Videos ({videos.length})
      </h4>
      <div className={`grid gap-3 ${getGridClasses('video', videos.length)}`}>
        {videos.map((block) => {
          const rawUrl = block.content.url;
          console.log('Multi-format video URL debug:', { blockId: block.id, rawUrl, content: block.content });

          if (!rawUrl || rawUrl === '' || rawUrl === 'undefined' || rawUrl === 'null') {
            return (
              <div key={block.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Video not available</p>
              </div>
            );
          }

          // More robust URL validation and formatting
          let formattedUrl = rawUrl.trim();

          // Check if it's a valid URL pattern
          if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
            // Try to detect if it looks like a domain/URL
            if (formattedUrl.includes('.') || formattedUrl.startsWith('www.')) {
              formattedUrl = `https://${formattedUrl}`;
            } else {
              // If it doesn't look like a URL, show error
              return (
                <div key={block.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-gray-500 text-sm">Invalid video format: {rawUrl}</p>
                </div>
              );
            }
          }

          // Final validation - try to construct URL
          try {
            new URL(formattedUrl);
          } catch (error) {
            console.warn('Invalid video URL after formatting:', formattedUrl, error);
            return (
              <div key={block.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-gray-500 text-sm">Invalid video URL format</p>
              </div>
            );
          }

          const handleVideoClick = (e) => {
            e.preventDefault();
            console.log('Opening video URL:', formattedUrl);
            try {
              window.open(formattedUrl, '_blank', 'noopener,noreferrer');
            } catch (error) {
              console.error('Failed to open video URL:', formattedUrl, error);
              window.open(formattedUrl, '_blank');
            }
          };

          return (
            <a
              key={block.id}
              href={formattedUrl}
              onClick={handleVideoClick}
              className="group bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-4 hover:shadow-md hover:border-orange-300 transition-all duration-300 cursor-pointer"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-orange-400 to-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="font-medium text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-1">
                    {block.content.title || 'Video Content'}
                  </h5>
                  <p className="text-sm text-gray-600 mt-1">Click to watch video</p>
                </div>
                <svg className="w-4 h-4 text-gray-400 group-hover:text-orange-500 transition-colors" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                </svg>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );

  // Render sections in order of importance
  const sectionOrder = ['image', 'text', 'link', 'video', 'document'];

  return (
    <div className="space-y-6">
      {sectionOrder.map(type => {
        const blocksOfType = groupedBlocks[type];
        if (!blocksOfType?.length) return null;

        switch (type) {
          case 'image':
            return <div key={type}>{renderImageSection(blocksOfType)}</div>;
          case 'text':
            return <div key={type}>{renderTextSection(blocksOfType)}</div>;
          case 'link':
            return <div key={type}>{renderResourceSection(blocksOfType)}</div>;
          case 'video':
            return <div key={type}>{renderVideoSection(blocksOfType)}</div>;
          case 'document':
            return <div key={type}>{renderDocumentSection(blocksOfType)}</div>;
          default:
            return null;
        }
      })}

      {Object.keys(groupedBlocks).length === 0 && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">No Evidence Available</h3>
          <p className="text-gray-600">No learning evidence has been submitted for this task.</p>
        </div>
      )}
    </div>
  );
};

export default EvidenceContentGrid;