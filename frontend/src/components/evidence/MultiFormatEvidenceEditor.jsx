import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { evidenceDocumentService } from '../../services/evidenceDocumentService';

const MultiFormatEvidenceEditor = forwardRef(({
  taskId,
  userId,
  legacyEvidenceText, // Legacy text evidence from quest_task_completions (Spark submissions)
  onComplete,
  onError,
  autoSaveEnabled = true,
  hideHeader = false // Hide the internal "Evidence Document" header
}, ref) => {
  const [blocks, setBlocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'unsaved'
  const [activeBlock, setActiveBlock] = useState(null);
  const [documentStatus, setDocumentStatus] = useState('draft');
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [uploadingBlocks, setUploadingBlocks] = useState(new Set()); // Block IDs currently uploading
  const [uploadErrors, setUploadErrors] = useState({}); // Block ID → error message
  const [collapsedBlocks, setCollapsedBlocks] = useState(new Set()); // Collapsed block IDs
  const [hasLegacyEvidence, setHasLegacyEvidence] = useState(false); // Track if we loaded legacy Spark evidence
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

          // Update block IDs with real database UUIDs from save response
          if (result.blocks && Array.isArray(result.blocks)) {
            setBlocks(prevBlocks => {
              return prevBlocks.map((block, index) => {
                // Find matching saved block by order_index
                const savedBlock = result.blocks.find(sb => sb.order_index === index);
                if (savedBlock?.id && savedBlock.id !== block.id) {
                  // Update temporary ID with real database UUID
                  return { ...block, id: savedBlock.id };
                }
                return block;
              });
            });
          }
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

  const cleanBlocksForSave = (blocksToClean) => {
    return blocksToClean.map(block => {
      const cleanedContent = { ...block.content };

      // Remove blob URLs - they're temporary and won't work after page reload
      // Keep permanent Supabase URLs
      if (cleanedContent.url && cleanedContent.url.startsWith('blob:')) {
        delete cleanedContent.url;
      }

      // Remove upload status flags and retry file references
      if (cleanedContent._uploadComplete) {
        delete cleanedContent._uploadComplete;
      }
      if (cleanedContent._retryFile) {
        delete cleanedContent._retryFile;
      }

      return {
        ...block,
        content: cleanedContent
      };
    });
  };

  // Auto-save when blocks change (but NOT if task is completed)
  useEffect(() => {
    // Debug logging for auto-save behavior
    console.log('[EVIDENCE] Auto-save check:', {
      isLoading,
      hasAutoSaver: !!autoSaverRef.current,
      blocksLength: blocks.length,
      documentStatus,
      willAutoSave: !isLoading && autoSaverRef.current && blocks.length > 0 && documentStatus !== 'completed'
    });

    // Don't auto-save if task is already completed - this prevents
    // overwriting the 'completed' status back to 'draft'
    if (!isLoading && autoSaverRef.current && blocks.length > 0 && documentStatus !== 'completed') {
      console.log('[EVIDENCE] Triggering auto-save with status: draft');
      setSaveStatus('unsaved');
      const cleanedBlocks = cleanBlocksForSave(blocks);
      autoSaverRef.current.autoSave(cleanedBlocks);
    } else if (documentStatus === 'completed') {
      console.log('[EVIDENCE] Skipping auto-save - task is completed');
    }
  }, [blocks, isLoading, documentStatus]);

  // Update parent container with save status when hideHeader is true
  useEffect(() => {
    if (hideHeader) {
      const container = document.getElementById('evidence-save-status');
      if (container) {
        // Clear existing content
        container.innerHTML = '';

        // Create save status elements
        if (saveStatus === 'saving') {
          container.innerHTML = `
            <div class="w-3 h-3 border-2 border-optio-purple border-t-transparent rounded-full animate-spin"></div>
            <span class="text-gray-600">Saving...</span>
          `;
        } else if (saveStatus === 'saved') {
          const timeString = lastSaved ? lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          container.innerHTML = `
            <svg class="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <span class="text-green-600">Saved ${timeString}</span>
          `;
        } else if (saveStatus === 'unsaved') {
          container.innerHTML = `
            <div class="w-2 h-2 bg-orange-400 rounded-full"></div>
            <span class="text-orange-600">Unsaved changes</span>
          `;
        }
      }
    }
  }, [hideHeader, saveStatus, lastSaved]);

  const loadDocument = async () => {
    try {
      setIsLoading(true);
      const response = await evidenceDocumentService.getDocument(taskId);

      if (response.success) {
        if (response.document) {
          setDocumentStatus(response.document.status);

          // Transform database blocks to frontend format
          const transformedBlocks = (response.blocks || []).map(block => ({
            id: block.id,
            type: block.block_type, // Database uses block_type, frontend expects type
            content: block.content,
            order: block.order_index,
            is_private: block.is_private || false // Support private evidence blocks
          }));

          setBlocks(transformedBlocks);
          if (response.document.updated_at) {
            setLastSaved(new Date(response.document.updated_at));
          }
        } else {
          // New document - check for legacy evidence text (Spark submissions)
          if (legacyEvidenceText) {
            // Create an editable text block from legacy evidence
            const legacyBlock = {
              id: `legacy-text-${Date.now()}`,
              type: 'text',
              content: { text: legacyEvidenceText },
              order: 0,
              is_private: false
            };
            setBlocks([legacyBlock]);
            setDocumentStatus('draft'); // Allow editing even though task is already marked complete
            setHasLegacyEvidence(true);

            // Immediately save legacy evidence to new document system as DRAFT
            // This creates the document in user_task_evidence_documents table
            // Keep as draft so user can continue editing/adding evidence
            setSaveStatus('saving');
            try {
              await evidenceDocumentService.saveDocument(taskId, [legacyBlock], 'draft');
              setSaveStatus('saved');
              setLastSaved(new Date());
            } catch (saveError) {
              console.error('Failed to save legacy evidence:', saveError);
              // Don't show error to user - they can still edit and it will save on next change
              setSaveStatus('saved'); // Pretend it's saved to avoid confusing the user
            }
          } else {
            setBlocks([]);
            setDocumentStatus('draft');
            setSaveStatus('saved');
          }
        }

        // Only set saved status if we didn't already handle it above
        if (!legacyEvidenceText || response.document) {
          setSaveStatus('saved');
        }
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


  const handleCompleteTask = async () => {
    try {
      setIsLoading(true);

      // Check if any uploads are still in progress
      if (uploadingBlocks.size > 0) {
        if (onError) {
          onError('Please wait for file uploads to complete before submitting.');
        }
        return;
      }

      // Save and complete the task (files are already uploaded)
      const cleanedBlocks = cleanBlocksForSave(blocks);
      console.log('[EVIDENCE] Submitting task completion with status: completed');
      console.log('[EVIDENCE] Current documentStatus before save:', documentStatus);

      const completeResponse = await evidenceDocumentService.saveDocument(taskId, cleanedBlocks, 'completed');

      if (completeResponse.success) {
        console.log('[EVIDENCE] Task completion successful - setting documentStatus to completed');
        console.log('[EVIDENCE] BEFORE setState - documentStatus:', documentStatus);

        // CRITICAL: Disable auto-save permanently BEFORE setting status
        // This prevents any pending auto-save from overwriting the 'completed' status
        if (autoSaverRef.current && autoSaverRef.current.disableAutoSave) {
          console.log('[EVIDENCE] Disabling auto-save permanently to prevent overwriting completion');
          autoSaverRef.current.disableAutoSave();
        } else if (autoSaverRef.current) {
          console.log('[EVIDENCE] Clearing auto-save (disableAutoSave not available)');
          autoSaverRef.current.clearAutoSave();
        }

        setDocumentStatus('completed');
        setSaveStatus('saved');
        console.log('[EVIDENCE] AFTER setState call - documentStatus:', documentStatus);
        console.log('[EVIDENCE] NOTE: State may not have updated yet due to React batching');
        if (onComplete) {
          onComplete({
            xp_awarded: completeResponse.xp_awarded || 0,
            has_collaboration_bonus: completeResponse.has_collaboration_bonus || false,
            quest_completed: completeResponse.quest_completed || false,
            message: completeResponse.xp_awarded
              ? `Task completed! You earned ${completeResponse.xp_awarded} XP`
              : 'Task completed successfully!'
          });
        }
      } else {
        if (onError) {
          onError(completeResponse.error || 'Failed to complete task.');
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

  const toggleBlockCollapse = (blockId) => {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  const addBlock = (type, position = blocks.length) => {
    const newBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      content: getDefaultContent(type),
      order: position,
      is_private: false // Default to public evidence
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

    // Auto-collapse all existing blocks except the new one
    setCollapsedBlocks(prev => {
      const next = new Set(blocks.map(b => b.id));
      next.delete(newBlock.id); // Keep new block expanded
      return next;
    });
  };

  // Expose addBlock method to parent component via ref
  // Expose methods to parent component via ref
  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({
    addBlock,
    submitTask: () => setShowCompleteConfirm(true)
  }));

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

  const uploadFileImmediately = async (file, blockId, blockType) => {
    try {
      // Store file reference for retry
      setBlocks(prevBlocks => prevBlocks.map(block =>
        block.id === blockId
          ? {
              ...block,
              content: {
                ...block.content,
                _retryFile: file
              }
            }
          : block
      ));

      // Add to uploading set
      setUploadingBlocks(prev => new Set(prev).add(blockId));
      setUploadErrors(prev => {
        const next = { ...prev };
        delete next[blockId];
        return next;
      });

      // First, save the document to ensure block has a database ID
      const cleanedBlocks = cleanBlocksForSave(blocks);
      const saveResponse = await evidenceDocumentService.saveDocument(taskId, cleanedBlocks, documentStatus);

      if (saveResponse.success && saveResponse.blocks) {
        // Find the saved block by matching order_index
        const currentBlockIndex = blocks.findIndex(b => b.id === blockId);
        const savedBlock = saveResponse.blocks.find(sb => sb.order_index === currentBlockIndex);

        if (savedBlock?.id) {
          // Upload file to Supabase storage
          const uploadResponse = await evidenceDocumentService.uploadBlockFile(savedBlock.id, file);

          if (uploadResponse.success && uploadResponse.file_url) {
            // Update block with permanent URL and remove retry file
            setBlocks(prevBlocks => prevBlocks.map(block =>
              block.id === blockId
                ? {
                    ...block,
                    content: {
                      ...block.content,
                      url: uploadResponse.file_url,
                      filename: uploadResponse.filename,
                      _uploadComplete: true,
                      _retryFile: undefined
                    }
                  }
                : block
            ));

            // Revoke blob URL to free memory
            if (blocks.find(b => b.id === blockId)?.content.url?.startsWith('blob:')) {
              URL.revokeObjectURL(blocks.find(b => b.id === blockId).content.url);
            }
          } else {
            throw new Error(uploadResponse.error || 'Upload failed');
          }
        } else {
          throw new Error('Failed to get block database ID');
        }
      } else {
        throw new Error(saveResponse.error || 'Failed to save document');
      }

      // Remove from uploading set
      setUploadingBlocks(prev => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });

    } catch (error) {
      console.error(`Failed to upload file for block ${blockId}:`, error);
      setUploadErrors(prev => ({
        ...prev,
        [blockId]: error.message || 'Upload failed'
      }));
      setUploadingBlocks(prev => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
      });

      if (onError) {
        onError(`Failed to upload ${file.name}: ${error.message}`);
      }
    }
  };

  const handleFileUpload = async (file, blockId, blockType) => {
    try {
      // Validate file size (10MB limit)
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
      if (file.size > MAX_FILE_SIZE) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
        const errorMsg = `File "${file.name}" is too large (${fileSizeMB}MB). Maximum size is 10MB.\n\nFor larger files, please:\n1. Upload to Google Drive or Dropbox\n2. Get a shareable link\n3. Use a "Link" block instead`;
        if (onError) {
          onError(errorMsg);
        }
        throw new Error(errorMsg);
      }

      // Create a temporary blob URL for immediate preview
      const localUrl = URL.createObjectURL(file);

      // Store file info for immediate preview
      const fileInfo = {
        file: file,
        localUrl: localUrl,
        name: file.name,
        size: file.size,
        type: file.type
      };

      // Trigger immediate upload in background
      uploadFileImmediately(file, blockId, blockType);

      return fileInfo;
    } catch (error) {
      console.error('File preparation error:', error);
      if (onError && !error.message.includes('too large')) {
        onError(`Failed to prepare file: ${error.message}`);
      }
      throw error;
    }
  };

  const getBlockPreview = (block) => {
    const config = blockTypes[block.type];

    switch (block.type) {
      case 'text':
        const text = block.content.text || '';
        return text.length > 50 ? `${text.substring(0, 50)}...` : text || 'Empty text block';
      case 'image':
        return block.content.url ? (
          <img src={block.content.url} alt={block.content.alt} className="h-12 w-auto object-contain rounded" />
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
                const fileInfo = await handleFileUpload(file, block.id, 'image');
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
                const fileInfo = await handleFileUpload(file, block.id, 'document');
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
    const isCollapsed = collapsedBlocks.has(block.id);
    const isUploading = uploadingBlocks.has(block.id);
    const hasUploadError = uploadErrors[block.id];

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
                  {...provided.dragHandleProps}
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
                    triggerAutoSave();
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
                      uploadFileImmediately(file, block.id, block.type);
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
        )}
      </Draggable>
    );
  };

  if (isLoading && blocks.length === 0) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-12">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-optio-purple border-t-transparent rounded-full animate-spin"></div>
          <span className="text-gray-600">Loading evidence document...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header with save status and add content options - conditionally hidden */}
      {!hideHeader && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">Evidence Document</h3>
              <div className="flex items-center gap-2 text-sm">
                {saveStatus === 'saving' && (
                  <>
                    <div className="w-4 h-4 border-2 border-optio-purple border-t-transparent rounded-full animate-spin"></div>
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
      )}

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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
      />

      {/* Task Completion Confirmation Modal */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Ready to submit?</h3>
                <p className="text-sm text-gray-600">This will mark the task as completed and award you XP.</p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-700">
                You can still edit your evidence later, but the task will be marked as done and added to your portfolio.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCompleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowCompleteConfirm(false);
                  handleCompleteTask();
                }}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {isLoading ? 'Submitting...' : 'Submit for XP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

MultiFormatEvidenceEditor.displayName = 'MultiFormatEvidenceEditor';

export default MultiFormatEvidenceEditor;