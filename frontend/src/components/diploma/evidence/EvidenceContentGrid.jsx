import React from 'react';

const EvidenceContentGrid = ({ blocks = [], onImageClick, onExpandToggle, expandedBlocks = new Set(), onOpenContent }) => {
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
        <svg className="w-4 h-4 mr-2 text-optio-purple" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
        Visual Evidence ({images.length})
      </h4>
      <div className={`grid gap-3 ${getGridClasses('image', images.length)}`}>
        {images.map((block, index) => {
          const imageUrl = block.content.url;
          const hasAltOrCaption = block.content.alt || block.content.caption;

          // Check if image URL is missing but metadata exists (blob URL was cleaned)
          if ((!imageUrl || imageUrl.startsWith('blob:')) && hasAltOrCaption) {
            return (
              <div key={block.id} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-amber-700 text-sm font-medium">Image needs to be re-uploaded</p>
                    {block.content.caption && (
                      <p className="text-amber-600 text-xs mt-1">{block.content.caption}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          // If no valid URL, skip rendering
          if (!imageUrl || imageUrl.startsWith('blob:')) {
            return null;
          }

          return (
            <div
              key={block.id}
              className="group relative overflow-hidden rounded-lg bg-gradient-to-br from-optio-pink/5 to-optio-purple/5 border border-optio-purple/10 cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
              onClick={() => onImageClick && onImageClick(block, index, images)}
            >
              <div className="aspect-video relative overflow-hidden">
                <img
                  src={imageUrl}
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
          );
        })}
      </div>
    </div>
  );

  // Render text content section
  const renderTextSection = (textBlocks) => (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
        <svg className="w-4 h-4 mr-2 text-optio-purple" fill="currentColor" viewBox="0 0 20 20">
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
              className="bg-gradient-to-br from-[#ef597b]/3 to-[#6d469b]/3 border border-optio-purple/15 rounded-lg p-4"
            >
              <div className={`text-sm text-gray-700 leading-relaxed ${shouldTruncate && !isExpanded ? 'line-clamp-4' : ''}`}>
                <p className="whitespace-pre-wrap">{block.content.text}</p>
              </div>
              {shouldTruncate && (
                <button
                  onClick={() => onExpandToggle && onExpandToggle(block.id)}
                  className="mt-3 text-optio-purple hover:text-optio-pink font-medium text-sm transition-colors"
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
        <svg className="w-4 h-4 mr-2 text-optio-purple" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5z" clipRule="evenodd" />
        </svg>
        Resources & Links ({resources.length})
      </h4>
      <div className={`grid gap-3 ${getGridClasses('link', resources.length)}`}>
        {resources.map((block) => {
          const rawUrl = block.content.url;

          // Check for blob URLs - these are temporary and won't work
          if (rawUrl && rawUrl.startsWith('blob:')) {
            return (
              <div key={block.id} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-amber-700 text-sm">Link needs to be re-entered</p>
                </div>
              </div>
            );
          }

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

          return (
            <div key={block.id} className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => window.open(formattedUrl, '_blank', 'noopener,noreferrer')}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-optio-purple" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-gray-900 text-sm mb-1 truncate">
                    {block.content.title || hostname}
                  </h4>
                  <p className="text-optio-purple text-xs font-medium">{hostname}</p>
                  {block.content.description && (
                    <p className="text-gray-600 text-xs mt-1 line-clamp-2">{block.content.description}</p>
                  )}
                </div>
              </div>
            </div>
          );

        })}
      </div>
    </div>
  );

  // Render document section
  const renderDocumentSection = (documents) => (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
        <svg className="w-4 h-4 mr-2 text-optio-purple" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
        Documents ({documents.length})
      </h4>
      <div className={`grid gap-3 ${getGridClasses('document', documents.length)}`}>
        {documents.map((block) => {
          const rawUrl = block.content.url;
          const hasFilename = block.content.filename || block.content.title;

          // Check for blob URLs - these are temporary and won't work
          if (rawUrl && rawUrl.startsWith('blob:')) {
            return (
              <div key={block.id} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-amber-700 text-sm">Document file needs to be re-uploaded</p>
                </div>
              </div>
            );
          }

          // If no URL but has filename/title, file was uploaded but URL was cleaned (blob URL was removed)
          if ((!rawUrl || rawUrl === '' || rawUrl === 'undefined' || rawUrl === 'null') && hasFilename) {
            return (
              <div key={block.id} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-amber-700 text-sm font-medium">Document needs to be re-uploaded</p>
                    <p className="text-amber-600 text-xs mt-1">File: {hasFilename}</p>
                  </div>
                </div>
              </div>
            );
          }

          // No URL and no filename - truly not available
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
                  <p className="text-gray-500 text-sm">Invalid document format</p>
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

          return (
            <div key={block.id} className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => window.open(formattedUrl, '_blank', 'noopener,noreferrer')}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-gray-900 text-sm mb-1 truncate">
                    {block.content.title || 'Document'}
                  </h4>
                  <p className="text-blue-600 text-xs font-medium">Open Document</p>
                  {block.content.description && (
                    <p className="text-gray-600 text-xs mt-1 line-clamp-2">{block.content.description}</p>
                  )}
                </div>
              </div>
            </div>
          );

        })}
      </div>
    </div>
  );

  // Render video section
  const renderVideoSection = (videos) => (
    <div className="mb-6">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
        <svg className="w-4 h-4 mr-2 text-optio-purple" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
        </svg>
        Videos ({videos.length})
      </h4>
      <div className={`grid gap-3 ${getGridClasses('video', videos.length)}`}>
        {videos.map((block) => {
          const rawUrl = block.content.url;

          // Check for blob URLs - these are temporary and won't work
          if (rawUrl && rawUrl.startsWith('blob:')) {
            return (
              <div key={block.id} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="text-amber-700 text-sm">Video file needs to be re-uploaded or link re-entered</p>
                </div>
              </div>
            );
          }

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

          return (
            <div key={block.id} className="bg-gradient-to-br from-red-50 to-pink-50 border border-red-200 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => window.open(formattedUrl, '_blank', 'noopener,noreferrer')}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-gray-900 text-sm mb-1 truncate">
                    {block.content.title || 'Video'}
                  </h4>
                  <p className="text-red-600 text-xs font-medium">Watch Video</p>
                  {block.content.description && (
                    <p className="text-gray-600 text-xs mt-1 line-clamp-2">{block.content.description}</p>
                  )}
                </div>
              </div>
            </div>
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