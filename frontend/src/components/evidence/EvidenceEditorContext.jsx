import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { evidenceDocumentService } from '../../services/evidenceDocumentService';
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
  const [uploadingBlocks, setUploadingBlocks] = useState(new Set()); // Block IDs currently uploading
  const [uploadErrors, setUploadErrors] = useState({}); // Block ID → error message
  const [collapsedBlocks, setCollapsedBlocks] = useState(new Set()); // Collapsed block IDs
  const [hasLegacyEvidence, setHasLegacyEvidence] = useState(false); // Track if we loaded legacy Spark evidence
  const autoSaverRef = useRef(null);

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
  }, [taskId, autoSaveEnabled, loadDocument, onError]);

  // Auto-save when blocks change (but NOT if task is completed)
  useEffect(() => {
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
    uploadingBlocks,
    setUploadingBlocks,
    uploadErrors,
    setUploadErrors,
    collapsedBlocks,
    setCollapsedBlocks,
    hasLegacyEvidence,
    setHasLegacyEvidence,

    // Refs
    autoSaverRef,

    // Methods
    cleanBlocksForSave,
    loadDocument,
    toggleBlockCollapse,

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
