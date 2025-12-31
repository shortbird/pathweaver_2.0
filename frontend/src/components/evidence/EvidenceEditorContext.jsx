import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { evidenceDocumentService } from '../../services/evidenceDocumentService';
import { useUploadQueue } from '../../hooks/useUploadQueue';
import logger from '../../utils/logger';

const EvidenceEditorContext = createContext(null);

export const useEvidenceEditor = () => {
  const context = useContext(EvidenceEditorContext);
  if (!context) {
    throw new Error('useEvidenceEditor must be used within EvidenceEditorProvider');
  }
  return context;
};

export const EvidenceEditorProvider = ({
  taskId,
  userId,
  legacyEvidenceText,
  onComplete,
  onError,
  autoSaveEnabled = true,
  children
}) => {
  const [blocks, setBlocks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'unsaved'
  const [activeBlock, setActiveBlock] = useState(null);
  const [documentStatus, setDocumentStatus] = useState('draft');
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [uploadErrors, setUploadErrors] = useState({}); // Block ID → error message
  const [collapsedBlocks, setCollapsedBlocks] = useState(new Set()); // Collapsed block IDs
  const [hasLegacyEvidence, setHasLegacyEvidence] = useState(false); // Track if we loaded legacy Spark evidence
  const [deletedBlocks, setDeletedBlocks] = useState([]); // Blocks deleted with undo support
  const autoSaverRef = useRef(null);
  const skipNextAutoSaveRef = useRef(false); // Skip auto-save after manual save

  // Upload queue hook - replaces uploadingBlocks Set with full queue management
  const uploadQueueState = useUploadQueue(taskId);

  const cleanBlocksForSave = useCallback((blocksToClean) => {
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
  }, []);

  const loadDocument = useCallback(async () => {
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
              logger.error('Failed to save legacy evidence:', saveError);
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
      logger.error('Error loading document:', error);
      if (onError) {
        onError('Failed to load evidence document.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [taskId, legacyEvidenceText, onError]);

  // Load document on mount only - track loaded taskId to prevent re-loading
  const loadedTaskIdRef = useRef(null);

  useEffect(() => {
    // Only load if this is a different task than we already loaded
    if (loadedTaskIdRef.current !== taskId) {
      loadedTaskIdRef.current = taskId;
      loadDocument();
    }
  }, [taskId, loadDocument]);

  // Initialize auto-saver separately
  useEffect(() => {
    if (autoSaveEnabled) {
      autoSaverRef.current = evidenceDocumentService.createAutoSaver(
        taskId,
        (result) => {
          setSaveStatus('saved');
          setLastSaved(new Date());

          // Update block IDs with real database UUIDs from save response
          if (result.blocks && Array.isArray(result.blocks) && result.blocks.length > 0) {
            setBlocks(prevBlocks => {
              // Only update if we have blocks to update
              if (prevBlocks.length === 0) return prevBlocks;

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
          logger.error('Auto-save failed:', error);
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
  }, [taskId, autoSaveEnabled, onError]);

  // Auto-save when blocks change (but NOT if task is completed)
  useEffect(() => {
    // Skip if we just did a manual save
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      logger.debug('[EVIDENCE] Skipping auto-save - manual save just completed');
      return;
    }

    // Debug logging for auto-save behavior
    logger.debug('[EVIDENCE] Auto-save check:', {
      isLoading,
      hasAutoSaver: !!autoSaverRef.current,
      blocksLength: blocks.length,
      documentStatus,
      willAutoSave: !isLoading && autoSaverRef.current && blocks.length > 0 && documentStatus !== 'completed'
    });

    // Don't auto-save if task is already completed - this prevents
    // overwriting the 'completed' status back to 'draft'
    if (!isLoading && autoSaverRef.current && blocks.length > 0 && documentStatus !== 'completed') {
      logger.debug('[EVIDENCE] Triggering auto-save with status: draft');
      setSaveStatus('unsaved');
      const cleanedBlocks = cleanBlocksForSave(blocks);
      autoSaverRef.current.autoSave(cleanedBlocks);
    } else if (documentStatus === 'completed') {
      logger.debug('[EVIDENCE] Skipping auto-save - task is completed');
      setSaveStatus('saved'); // Mark as saved when auto-save is disabled due to completion
    }
  }, [blocks, isLoading, documentStatus, cleanBlocksForSave]);

  const toggleBlockCollapse = useCallback((blockId) => {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }, []);

  /**
   * Delete block with undo support
   * Stores block in deletedBlocks array for 5 seconds
   */
  const deleteBlockWithUndo = useCallback((blockId) => {
    const blockToDelete = blocks.find(b => b.id === blockId);
    if (!blockToDelete) return;

    // Remove from blocks array
    setBlocks(prev => prev.filter(b => b.id !== blockId));

    // Add to deleted blocks with timestamp
    const deletedBlock = {
      ...blockToDelete,
      deletedAt: Date.now()
    };
    setDeletedBlocks(prev => [...prev, deletedBlock]);

    // Auto-remove from deletedBlocks after 5 seconds
    setTimeout(() => {
      setDeletedBlocks(prev => prev.filter(b => b.id !== blockId));
    }, 5000);
  }, [blocks]);

  /**
   * Restore a deleted block from deletedBlocks array
   */
  const restoreBlock = useCallback((blockId) => {
    const blockToRestore = deletedBlocks.find(b => b.id === blockId);
    if (!blockToRestore) {
      logger.warn('Cannot restore block - not found in deleted blocks:', blockId);
      return;
    }

    // Remove deletedAt timestamp
    const { deletedAt, ...cleanBlock } = blockToRestore;

    // Add back to blocks array at original position
    setBlocks(prev => {
      const newBlocks = [...prev, cleanBlock];
      // Sort by order to maintain proper position
      return newBlocks.sort((a, b) => (a.order || 0) - (b.order || 0));
    });

    // Remove from deleted blocks
    setDeletedBlocks(prev => prev.filter(b => b.id !== blockId));
  }, [deletedBlocks]);

  const value = {
    // State
    blocks,
    setBlocks,
    isLoading,
    setIsLoading,
    lastSaved,
    setLastSaved,
    saveStatus,
    setSaveStatus,
    activeBlock,
    setActiveBlock,
    documentStatus,
    setDocumentStatus,
    showCompleteConfirm,
    setShowCompleteConfirm,
    showAddMenu,
    setShowAddMenu,
    uploadErrors,
    setUploadErrors,
    collapsedBlocks,
    setCollapsedBlocks,
    hasLegacyEvidence,
    setHasLegacyEvidence,
    deletedBlocks,
    setDeletedBlocks,

    // Upload queue state (replaces uploadingBlocks)
    uploadQueue: uploadQueueState.queue,
    isOnline: uploadQueueState.isOnline,
    pendingCount: uploadQueueState.pendingCount,
    failedCount: uploadQueueState.failedCount,
    addToQueue: uploadQueueState.addToQueue,
    retryUpload: uploadQueueState.retryUpload,
    cancelUpload: uploadQueueState.cancelUpload,
    clearCompleted: uploadQueueState.clearCompleted,
    updateUploadItem: uploadQueueState.updateItem,
    markUploadComplete: uploadQueueState.markComplete,
    markUploadFailed: uploadQueueState.markFailed,
    updateUploadProgress: uploadQueueState.updateProgress,

    // Refs
    autoSaverRef,
    skipNextAutoSaveRef,

    // Methods
    cleanBlocksForSave,
    loadDocument,
    toggleBlockCollapse,
    deleteBlockWithUndo,
    restoreBlock,

    // Props
    taskId,
    userId,
    legacyEvidenceText,
    onComplete,
    onError,
    autoSaveEnabled
  };

  return (
    <EvidenceEditorContext.Provider value={value}>
      {children}
    </EvidenceEditorContext.Provider>
  );
};

export default EvidenceEditorContext;
