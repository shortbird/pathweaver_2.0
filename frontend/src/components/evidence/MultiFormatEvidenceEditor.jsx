import React, { useState, useRef, useCallback, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { evidenceDocumentService } from '../../services/evidenceDocumentService';

const MultiFormatEvidenceEditor = ({
  taskId,
  userId,
  onComplete,
  onError,
  autoSaveEnabled = true
}) => {
  const [blocks, setBlocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'unsaved'
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [activeBlock, setActiveBlock] = useState(null);
  const [documentStatus, setDocumentStatus] = useState('draft');
  const fileInputRef = useRef(null);
  const autoSaverRef = useRef(null);

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

  // Initialize auto-saver and load document
  useEffect(() => {
    loadDocument();

    if (autoSaveEnabled) {
      autoSaverRef.current = evidenceDocumentService.createAutoSaver(
        taskId,
        (result) => {
          setSaveStatus('saved');
          setLastSaved(new Date());
        },
        (error) => {
          console.error('Auto-save failed:', error);
          setSaveStatus('unsaved');
          if (onError) {
            onError('Auto-save failed. Your changes may not be saved.');
          }
        }
      );
    }

    return () => {
      if (autoSaverRef.current) {
        autoSaverRef.current.clearAutoSave();
      }
    };
  }, [taskId, autoSaveEnabled]);

  // Auto-save when blocks change
  useEffect(() => {
    if (!isLoading && autoSaverRef.current && blocks.length > 0) {
      setSaveStatus('unsaved');
      autoSaverRef.current.autoSave(blocks);
    }
  }, [blocks, isLoading]);

  const loadDocument = async () => {
    try {
      setIsLoading(true);
      const response = await evidenceDocumentService.getDocument(taskId);

      if (response.success) {
        if (response.document) {
          setDocumentStatus(response.document.status);
          setBlocks(response.blocks || []);
          if (response.document.updated_at) {
            setLastSaved(new Date(response.document.updated_at));
          }
        } else {
          // New document
          setBlocks([]);
          setDocumentStatus('draft');
        }
        setSaveStatus('saved');
      }
    } catch (error) {
      console.error('Error loading document:', error);
      if (onError) {
        onError('Failed to load evidence document.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSave = async () => {
    try {
      setSaveStatus('saving');
      const response = await evidenceDocumentService.saveDocument(taskId, blocks, documentStatus);

      if (response.success) {
        setSaveStatus('saved');
        setLastSaved(new Date());
      } else {
        setSaveStatus('unsaved');
        if (onError) {
          onError(response.error || 'Failed to save document.');
        }
      }
    } catch (error) {
      console.error('Error saving document:', error);
      setSaveStatus('unsaved');
      if (onError) {
        onError('Failed to save document.');
      }
    }
  };

  const handleCompleteTask = async () => {
    try {
      setIsLoading(true);

      // First save the current state
      await evidenceDocumentService.saveDocument(taskId, blocks, 'completed');

      // Then complete the task
      const response = await evidenceDocumentService.completeTask(taskId);

      if (response.success) {
        setDocumentStatus('completed');
        setSaveStatus('saved');
        if (onComplete) {
          onComplete({
            xp_awarded: response.xp_awarded,
            has_collaboration_bonus: response.has_collaboration_bonus,
            quest_completed: response.quest_completed,
            message: `Task completed! You earned ${response.xp_awarded} XP`
          });
        }
      } else {
        if (onError) {
          onError(response.error || 'Failed to complete task.');
        }
      }
    } catch (error) {
      console.error('Error completing task:', error);
      if (onError) {
        onError('Failed to complete task.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const addBlock = (type, position = blocks.length) => {
    const newBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      content: getDefaultContent(type),
      order: position
    };

    const newBlocks = [...blocks];
    newBlocks.splice(position, 0, newBlock);

    // Update order indices
    const reorderedBlocks = newBlocks.map((block, index) => ({
      ...block,
      order: index
    }));

    setBlocks(reorderedBlocks);
    setShowAddMenu(false);
    setActiveBlock(newBlock.id);
  };

  const getDefaultContent = (type) => {
    switch (type) {
      case 'text':
        return { text: '' };
      case 'image':
        return { url: '', alt: '', caption: '' };
      case 'video':
        return { url: '', title: '', platform: 'youtube' };
      case 'link':
        return { url: '', title: '', description: '' };
      case 'document':
        return { url: '', title: '', filename: '' };
      default:
        return {};
    }
  };

  const updateBlock = (blockId, newContent) => {
    setBlocks(blocks.map(block =>
      block.id === blockId
        ? { ...block, content: { ...block.content, ...newContent } }
        : block
    ));
  };

  const deleteBlock = (blockId) => {
    const filteredBlocks = blocks.filter(block => block.id !== blockId);
    const reorderedBlocks = filteredBlocks.map((block, index) => ({
      ...block,
      order: index
    }));
    setBlocks(reorderedBlocks);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const newBlocks = Array.from(blocks);
    const [reorderedItem] = newBlocks.splice(result.source.index, 1);
    newBlocks.splice(result.destination.index, 0, reorderedItem);

    // Update order indices
    const reorderedBlocks = newBlocks.map((block, index) => ({
      ...block,
      order: index
    }));

    setBlocks(reorderedBlocks);
  };

  const handleFileUpload = async (file, blockId) => {
    try {
      const response = await evidenceDocumentService.uploadBlockFile(blockId, file);
      if (response.success) {
        return response.file_url;
      } else {
        throw new Error(response.error || 'Upload failed');
      }
    } catch (error) {
      console.error('File upload error:', error);
      if (onError) {
        onError(`Failed to upload file: ${error.message}`);
      }
      throw error;
    }
  };

  const renderTextBlock = (block) => (
    <div className="space-y-3">
      <textarea
        value={block.content.text || ''}
        onChange={(e) => updateBlock(block.id, { text: e.target.value })}
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent resize-none transition-all"
        rows={Math.max(3, Math.ceil((block.content.text || '').length / 80))}
        placeholder="Share your thoughts, process, or reflections..."
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
            alt={block.content.alt || ''}
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
                const url = await handleFileUpload(file, block.id);
                updateBlock(block.id, { url, alt: file.name });
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
            type="text"
            value={block.content.alt || ''}
            onChange={(e) => updateBlock(block.id, { alt: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
            placeholder="Alt text (for accessibility)"
          />
          <input
            type="text"
            value={block.content.caption || ''}
            onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
            placeholder="Caption (optional)"
          />
        </div>
      )}
    </div>
  );

  const renderVideoBlock = (block) => (
    <div className="space-y-3">
      <input
        type="url"
        value={block.content.url || ''}
        onChange={(e) => updateBlock(block.id, { url: e.target.value })}
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
        placeholder="YouTube, Vimeo, or direct video URL"
      />
      <input
        type="text"
        value={block.content.title || ''}
        onChange={(e) => updateBlock(block.id, { title: e.target.value })}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
        placeholder="Video title (optional)"
      />

      {block.content.url && (
        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
          <p className="text-xs text-gray-600 mb-1">Preview:</p>
          <a
            href={block.content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#6d469b] hover:text-[#ef597b] font-medium break-all"
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
        type="url"
        value={block.content.url || ''}
        onChange={(e) => updateBlock(block.id, { url: e.target.value })}
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
        placeholder="https://example.com/your-work"
      />
      <input
        type="text"
        value={block.content.title || ''}
        onChange={(e) => updateBlock(block.id, { title: e.target.value })}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
        placeholder="Link title"
      />
      <textarea
        value={block.content.description || ''}
        onChange={(e) => updateBlock(block.id, { description: e.target.value })}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent resize-none"
        rows={2}
        placeholder="Description (optional)"
      />

      {block.content.url && (
        <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
          <p className="text-xs text-gray-600 mb-1">Preview:</p>
          <a
            href={block.content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#6d469b] hover:text-[#ef597b] font-medium break-all"
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
                const url = await handleFileUpload(file, block.id);
                updateBlock(block.id, { url, filename: file.name, title: file.name });
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
          type="text"
          value={block.content.title || ''}
          onChange={(e) => updateBlock(block.id, { title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6d469b] focus:border-transparent"
          placeholder="Document title"
        />
      )}
    </div>
  );

  const renderBlock = (block, index) => {
    const config = blockTypes[block.type];

    return (
      <Draggable key={block.id} draggableId={block.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className={`
              relative group bg-white border-2 rounded-xl p-4 transition-all
              ${activeBlock === block.id ? config.borderColor : 'border-gray-200'}
              ${snapshot.isDragging ? 'shadow-lg rotate-2' : 'hover:border-gray-300'}
            `}
          >
            {/* Block Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  {...provided.dragHandleProps}
                  className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9h8M8 15h8" />
                  </svg>
                </div>
                <span className="text-lg">{config.icon}</span>
                <span className="text-sm font-medium text-gray-700">{config.label}</span>
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

            {/* Block Content */}
            <div>
              {block.type === 'text' && renderTextBlock(block)}
              {block.type === 'image' && renderImageBlock(block)}
              {block.type === 'video' && renderVideoBlock(block)}
              {block.type === 'link' && renderLinkBlock(block)}
              {block.type === 'document' && renderDocumentBlock(block)}
            </div>
          </div>
        )}
      </Draggable>
    );
  };

  if (isLoading && blocks.length === 0) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-12">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-[#6d469b] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-gray-600">Loading evidence document...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header with save status */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Evidence Document</h3>
          <div className="flex items-center gap-2 text-sm">
            {saveStatus === 'saving' && (
              <>
                <div className="w-4 h-4 border-2 border-[#6d469b] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-gray-600">Saving...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-green-600">Saved</span>
                {lastSaved && (
                  <span className="text-gray-500">
                    {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                <span className="text-orange-600">Unsaved changes</span>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleManualSave}
            disabled={isLoading || saveStatus === 'saving'}
            className="px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:shadow-md transition-all disabled:opacity-50"
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Save Progress'}
          </button>

          {documentStatus === 'draft' && blocks.length > 0 && (
            <button
              onClick={handleCompleteTask}
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all disabled:opacity-50"
            >
              {isLoading ? 'Completing...' : 'Mark Complete'}
            </button>
          )}

          {documentStatus === 'completed' && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Task Completed</span>
            </div>
          )}
        </div>
      </div>

      {/* Evidence Blocks */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="evidence-blocks">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
              {blocks.map((block, index) => renderBlock(block, index))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add Block Button */}
      <div className="mt-6">
        {showAddMenu ? (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Add Content Block</h4>
              <button
                onClick={() => setShowAddMenu(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {Object.entries(blockTypes).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => addBlock(type)}
                  className={`
                    p-3 rounded-lg border-2 transition-all duration-200 hover:shadow-md
                    ${config.borderColor} ${config.bgColor} border-opacity-50 hover:border-opacity-100
                  `}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-2xl">{config.icon}</span>
                    <span className="text-xs font-medium text-gray-700">{config.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddMenu(true)}
            className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="font-medium">Add Content Block</span>
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
      />
    </div>
  );
};

export default MultiFormatEvidenceEditor;