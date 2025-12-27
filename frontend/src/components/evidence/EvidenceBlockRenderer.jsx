import React, { useRef } from 'react';
import { useEvidenceEditor } from './EvidenceEditorContext';

const blockTypes = {
  text: {
    icon: '📝',
    label: 'Text',
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200'
  },
  image: {
    icon: '📸',
    label: 'Image',
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200'
  },
  video: {
    icon: '🎥',
    label: 'Video',
    color: 'from-orange-500 to-red-500',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200'
  },
  link: {
    icon: '🔗',
    label: 'Link',
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200'
  },
  document: {
    icon: '📄',
    label: 'Document',
    color: 'from-gray-500 to-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200'
  }
};

export const EvidenceBlockRenderer = ({ block, index, dragHandleProps = {}, style = {}, mediaHandlers, addBlock, updateBlock, deleteBlock }) => {
  const {
    activeBlock,
    setActiveBlock,
    collapsedBlocks,
    toggleBlockCollapse,
    uploadingBlocks,
    uploadErrors,
    setBlocks
  } = useEvidenceEditor();

  const fileInputRef = useRef(null);
  const config = blockTypes[block.type];
  const isCollapsed = collapsedBlocks.has(block.id);
  const isUploading = uploadingBlocks.has(block.id);
  const hasUploadError = uploadErrors[block.id];

  const getBlockPreview = (block) => {
    switch (block.type) {
      case 'text':
        const text = block.content.text || '';
        return text.length > 50 ? `${text.substring(0, 50)}...` : text || 'Empty text block';
      case 'image':
        return block.content.url ? (
          <img src={block.content.url} alt={block.content.alt || 'Image preview'} className="h-12 w-auto object-contain rounded" />
        ) : 'No image uploaded';
      case 'video':
        return block.content.title || block.content.url || 'No video URL';
      case 'link':
        return block.content.title || block.content.url || 'No link URL';
      case 'document':
        return block.content.filename || block.content.title || 'No document uploaded';
      default:
        return 'Empty block';
    }
  };

  const renderTextBlock = (block) => (
    <div className="space-y-3">
      <textarea
        id={`text-block-${block.id}`}
        value={block.content.text || ''}
        onChange={(e) => updateBlock(block.id, { text: e.target.value })}
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent resize-none transition-all"
        rows={Math.max(3, Math.ceil((block.content.text || '').length / 80))}
        placeholder="Share your thoughts, process, or reflections..."
        aria-label="Text evidence"
        onFocus={() => setActiveBlock(block.id)}
        onBlur={() => setActiveBlock(null)}
      />
      <div className="text-xs text-gray-500 text-right">
        {(block.content.text || '').length} characters
      </div>
    </div>
  );

  const renderImageBlock = (block) => (
    <div className="space-y-3">
      {block.content.url ? (
        <div className="relative group">
          <img
            src={block.content.url}
            alt={block.content.alt || 'Uploaded evidence image'}
            className="w-full max-h-96 object-contain rounded-lg border border-gray-200"
          />
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => updateBlock(block.id, { url: '', alt: '', caption: '' })}
              className="p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
          onClick={() => {
            fileInputRef.current.accept = 'image/*';
            fileInputRef.current.onchange = async (e) => {
              const file = e.target.files[0];
              if (file) {
                const fileInfo = await mediaHandlers.handleFileUpload(file, block.id, 'image');
                updateBlock(block.id, {
                  url: fileInfo.localUrl,
                  alt: file.name
                });
              }
            };
            fileInputRef.current.click();
          }}
        >
          <div className="text-4xl mb-2">📸</div>
          <p className="text-sm text-gray-600">Click to upload an image</p>
        </div>
      )}

      {block.content.url && (
        <div className="space-y-2">
          <input
            id={`image-alt-${block.id}`}
            type="text"
            value={block.content.alt || ''}
            onChange={(e) => updateBlock(block.id, { alt: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
            placeholder="Alt text (for accessibility)"
            aria-label="Image alt text"
          />
          <input
            id={`image-caption-${block.id}`}
            type="text"
            value={block.content.caption || ''}
            onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
            placeholder="Caption (optional)"
            aria-label="Image caption"
          />
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
      />
    </div>
  );

  const renderVideoBlock = (block) => (
    <div className="space-y-3">
      <input
        id={`video-url-${block.id}`}
        type="url"
        value={block.content.url || ''}
        onChange={(e) => updateBlock(block.id, { url: e.target.value })}
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
        placeholder="YouTube, Vimeo, or direct video URL"
        aria-label="Video URL"
      />
      <input
        id={`video-title-${block.id}`}
        type="text"
        value={block.content.title || ''}
        onChange={(e) => updateBlock(block.id, { title: e.target.value })}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
        placeholder="Video title (optional)"
        aria-label="Video title"
      />

      {block.content.url && (
        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
          <p className="text-xs text-gray-600 mb-1">Preview:</p>
          <a
            href={block.content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-optio-purple hover:text-optio-pink font-medium break-all"
          >
            {block.content.title || block.content.url}
          </a>
        </div>
      )}
    </div>
  );

  const renderLinkBlock = (block) => (
    <div className="space-y-3">
      <input
        id={`link-url-${block.id}`}
        type="url"
        value={block.content.url || ''}
        onChange={(e) => updateBlock(block.id, { url: e.target.value })}
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
        placeholder="https://example.com/your-work"
        aria-label="Link URL"
      />
      <input
        id={`link-title-${block.id}`}
        type="text"
        value={block.content.title || ''}
        onChange={(e) => updateBlock(block.id, { title: e.target.value })}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
        placeholder="Link title"
        aria-label="Link title"
      />
      <textarea
        id={`link-description-${block.id}`}
        value={block.content.description || ''}
        onChange={(e) => updateBlock(block.id, { description: e.target.value })}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent resize-none"
        rows={2}
        placeholder="Description (optional)"
        aria-label="Link description"
      />

      {block.content.url && (
        <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
          <p className="text-xs text-gray-600 mb-1">Preview:</p>
          <a
            href={block.content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-optio-purple hover:text-optio-pink font-medium break-all"
          >
            {block.content.title || block.content.url}
          </a>
          {block.content.description && (
            <p className="text-xs text-gray-600 mt-1">{block.content.description}</p>
          )}
        </div>
      )}
    </div>
  );

  const renderDocumentBlock = (block) => (
    <div className="space-y-3">
      {block.content.url ? (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="text-2xl">📄</div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {block.content.title || block.content.filename || 'Document'}
              </p>
              <p className="text-xs text-gray-500">{block.content.filename}</p>
            </div>
          </div>
          <button
            onClick={() => updateBlock(block.id, { url: '', title: '', filename: '' })}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
          onClick={() => {
            fileInputRef.current.accept = '.pdf,.doc,.docx';
            fileInputRef.current.onchange = async (e) => {
              const file = e.target.files[0];
              if (file) {
                const fileInfo = await mediaHandlers.handleFileUpload(file, block.id, 'document');
                updateBlock(block.id, {
                  url: fileInfo.localUrl,
                  filename: file.name,
                  title: file.name
                });
              }
            };
            fileInputRef.current.click();
          }}
        >
          <div className="text-4xl mb-2">📄</div>
          <p className="text-sm text-gray-600">Click to upload a document</p>
          <p className="text-xs text-gray-500">PDF, DOC, DOCX</p>
        </div>
      )}

      {block.content.url && (
        <input
          id={`document-title-${block.id}`}
          type="text"
          value={block.content.title || ''}
          onChange={(e) => updateBlock(block.id, { title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
          placeholder="Document title"
          aria-label="Document title"
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
      />
    </div>
  );

  return (
    <div
      style={style}
      className={`
        relative group bg-white border-2 rounded-xl p-4 transition-all
        ${activeBlock === block.id ? config.borderColor : 'border-gray-200'}
        hover:border-gray-300
        ${isCollapsed ? 'bg-gray-50' : ''}
      `}
    >
      {/* Upload Status Overlay */}
      {isUploading && (
        <div className="absolute top-2 right-2 z-10 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          Uploading...
        </div>
      )}
      {hasUploadError && (
        <div className="absolute top-2 right-2 z-10 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium flex items-center gap-2">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          Upload failed
        </div>
      )}

      {/* Block Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-1">
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9h8M8 15h8" />
            </svg>
          </div>
          <span className="text-lg">{config.icon}</span>
          <span className="text-sm font-medium text-gray-700">{config.label}</span>

          {/* Collapse/Expand Button */}
          <button
            onClick={() => toggleBlockCollapse(block.id)}
            className="ml-2 p-1 text-gray-400 hover:text-gray-600 rounded"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isCollapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              )}
            </svg>
          </button>

          {/* Private Evidence Toggle */}
          <button
            onClick={() => {
              setBlocks(prevBlocks => prevBlocks.map(b =>
                b.id === block.id ? { ...b, is_private: !b.is_private } : b
              ));
            }}
            className={`ml-2 p-1 rounded transition-colors ${
              block.is_private
                ? 'text-gray-700 bg-gray-100'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            title={block.is_private ? 'Private - Hidden from diploma' : 'Public - Visible on diploma'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {block.is_private ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              ) : (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </>
              )}
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => addBlock('text', index + 1)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title="Add block below"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>
          <button
            onClick={() => deleteBlock(block.id)}
            className="p-1 text-red-400 hover:text-red-600 rounded"
            title="Delete block"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Block Content or Preview */}
      {isCollapsed ? (
        <div className="py-2 px-4 bg-white rounded-lg border border-gray-200 text-sm text-gray-600">
          {getBlockPreview(block)}
        </div>
      ) : (
        <div>
          {block.type === 'text' && renderTextBlock(block)}
          {block.type === 'image' && renderImageBlock(block)}
          {block.type === 'video' && renderVideoBlock(block)}
          {block.type === 'link' && renderLinkBlock(block)}
          {block.type === 'document' && renderDocumentBlock(block)}
        </div>
      )}

      {/* Retry Button for Failed Uploads */}
      {hasUploadError && !isCollapsed && (
        <div className="mt-3">
          <button
            onClick={() => {
              const file = block.content._retryFile;
              if (file) {
                mediaHandlers.uploadFileImmediately(file, block.id, block.type);
              }
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
          >
            Retry Upload
          </button>
          <p className="text-xs text-red-600 mt-1">{hasUploadError}</p>
        </div>
      )}
    </div>
  );
};

export default EvidenceBlockRenderer;
