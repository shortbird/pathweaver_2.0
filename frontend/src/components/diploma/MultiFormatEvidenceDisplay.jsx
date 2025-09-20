import React from 'react';

const MultiFormatEvidenceDisplay = ({ blocks = [] }) => {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
        <p className="text-sm text-gray-500">No evidence content available</p>
      </div>
    );
  }

  const renderTextBlock = (block) => (
    <div key={block.id} className="p-4 rounded-lg" style={{
      background: 'linear-gradient(135deg, rgba(239,89,123,0.03) 0%, rgba(109,70,155,0.03) 100%)',
      border: '1px solid rgba(109,70,155,0.08)'
    }}>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">
        {block.content.text}
      </p>
    </div>
  );

  const renderImageBlock = (block) => (
    <div key={block.id} className="p-4 rounded-lg" style={{
      background: 'linear-gradient(135deg, rgba(239,89,123,0.03) 0%, rgba(109,70,155,0.03) 100%)',
      border: '1px solid rgba(109,70,155,0.08)'
    }}>
      <img
        src={block.content.url}
        alt={block.content.alt || 'Task evidence'}
        className="max-w-full rounded-lg cursor-pointer hover:opacity-90"
        onClick={() => window.open(block.content.url, '_blank')}
      />
      {block.content.caption && (
        <p className="text-xs text-gray-600 mt-2 italic">{block.content.caption}</p>
      )}
    </div>
  );

  const renderVideoBlock = (block) => (
    <div key={block.id} className="p-3 bg-orange-50 rounded-lg">
      <a
        href={block.content.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-orange-600 hover:text-orange-700 underline text-sm flex items-center"
      >
        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
        </svg>
        {block.content.title || 'Watch Video'}
      </a>
    </div>
  );

  const renderLinkBlock = (block) => (
    <div key={block.id} className="p-3 bg-blue-50 rounded-lg">
      <a
        href={block.content.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-700 underline text-sm flex items-center"
      >
        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5z" clipRule="evenodd" />
          <path fillRule="evenodd" d="M7.414 15.414a2 2 0 01-2.828-2.828l3-3a2 2 0 012.828 0 1 1 0 001.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 00-1.414-1.414l-1.5 1.5z" clipRule="evenodd" />
        </svg>
        {block.content.title || block.content.url}
      </a>
      {block.content.description && (
        <p className="text-xs text-gray-600 mt-1">{block.content.description}</p>
      )}
    </div>
  );

  const renderDocumentBlock = (block) => (
    <div key={block.id} className="p-3 bg-gray-50 rounded-lg">
      <a
        href={block.content.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-600 hover:text-gray-700 underline text-sm flex items-center"
      >
        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
        </svg>
        {block.content.title || block.content.filename || 'View Document'}
      </a>
    </div>
  );

  const renderBlock = (block) => {
    switch (block.block_type) {
      case 'text':
        return renderTextBlock(block);
      case 'image':
        return renderImageBlock(block);
      case 'video':
        return renderVideoBlock(block);
      case 'link':
        return renderLinkBlock(block);
      case 'document':
        return renderDocumentBlock(block);
      default:
        return (
          <div key={block.id} className="p-3 bg-gray-100 rounded-lg">
            <p className="text-sm text-gray-500">Unsupported content type: {block.block_type}</p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      {blocks
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
        .map(renderBlock)}
    </div>
  );
};

export default MultiFormatEvidenceDisplay;