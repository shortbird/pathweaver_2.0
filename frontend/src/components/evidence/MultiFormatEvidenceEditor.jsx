import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { evidenceDocumentService } from '../../services/evidenceDocumentService';
import logger from '../../utils/logger';
import toast from 'react-hot-toast';

import { EvidenceEditorProvider, useEvidenceEditor } from './EvidenceEditorContext';
import { EvidenceBlockRenderer } from './EvidenceBlockRenderer';
import { EvidenceToolbar, ConnectedSaveStatus } from './EvidenceToolbar';
import { EvidenceMediaHandlers } from './EvidenceMediaHandlers';
import InlineBlockAdder from './InlineBlockAdder';

// Sortable Block Wrapper Component
const SortableBlock = ({ block, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Clone children with drag props passed correctly
  return React.cloneElement(children, {
    sortableRef: setNodeRef,
    sortableStyle: style,
    dragHandleProps: { ...attributes, ...listeners },
  });
};

const getDefaultContent = (type) => {
  switch (type) {
    case 'text':
      return { text: '' };
    case 'image':
      // Support multiple images with items array
      return { items: [], alt: '', caption: '' };
    case 'video':
      // Support multiple videos with items array
      return { items: [], title: '' };
    case 'link':
      // Support multiple links with items array
      return { items: [] };
    case 'document':
      // Support multiple documents with items array
      return { items: [] };
    default:
      return {};
  }
};

const BLOCK_TYPE_LABELS = {
  text: 'Text',
  image: 'Image',
  video: 'Video',
  link: 'Link',
  document: 'Document'
};

// Main editor component (wrapped with context)
const MultiFormatEvidenceEditorInner = forwardRef(({ hideHeader = false }, ref) => {
  const {
    blocks,
    setBlocks,
    isLoading,
    setIsLoading,
    documentStatus,
    setDocumentStatus,
    showCompleteConfirm,
    setShowCompleteConfirm,
    uploadingBlocks,
    uploadErrors,
    setUploadErrors,
    setUploadingBlocks,
    collapsedBlocks,
    autoSaverRef,
    cleanBlocksForSave,
    taskId,
    onComplete,
    onError,
    setSaveStatus,
    saveStatus,
    lastSaved,
    setLastSaved,
    skipNextAutoSaveRef
  } = useEvidenceEditor();

  // Track newly added blocks for animation
  const [newBlockIds, setNewBlockIds] = useState(new Set());

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 6,
      },
    })
  );

  // Create media handlers instance
  const mediaHandlers = useMemo(() => new EvidenceMediaHandlers({
    blocks,
    setBlocks,
    documentStatus,
    taskId,
    setUploadingBlocks,
    setUploadErrors,
    onError
  }), [blocks, documentStatus, taskId, onError]);

  const addBlock = (type, position) => {
    const newBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      content: getDefaultContent(type),
      order: 0,
      is_private: false // Default to public evidence
    };

    // Use functional update to avoid stale closure issues
    setBlocks(prevBlocks => {
      const insertPosition = position !== undefined ? position : prevBlocks.length;
      const newBlocks = [...prevBlocks];
      newBlocks.splice(insertPosition, 0, newBlock);

      // Update order indices
      return newBlocks.map((block, index) => ({
        ...block,
        order: index
      }));
    });

    // Track new block for animation
    setNewBlockIds(prev => new Set([...prev, newBlock.id]));

    // Remove from new blocks set after animation completes
    setTimeout(() => {
      setNewBlockIds(prev => {
        const next = new Set(prev);
        next.delete(newBlock.id);
        return next;
      });
    }, 500);

    // Show toast notification
    toast.success(`${BLOCK_TYPE_LABELS[type] || 'Block'} block added`);
  };

  const updateBlock = (blockId, newContent) => {
    setBlocks(prevBlocks => prevBlocks.map(block =>
      block.id === blockId
        ? { ...block, content: { ...block.content, ...newContent } }
        : block
    ));
  };

  const deleteBlock = (blockId) => {
    // Get block type before deleting for toast message
    const blockToDelete = blocks.find(b => b.id === blockId);
    const blockType = blockToDelete?.type || 'Block';

    setBlocks(prevBlocks => {
      const filteredBlocks = prevBlocks.filter(block => block.id !== blockId);
      return filteredBlocks.map((block, index) => ({
        ...block,
        order: index
      }));
    });

    // Show toast notification
    toast.success(`${BLOCK_TYPE_LABELS[blockType] || 'Block'} block removed`);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    setBlocks((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const newBlocks = arrayMove(items, oldIndex, newIndex);

      // Update order indices
      return newBlocks.map((block, index) => ({
        ...block,
        order: index
      }));
    });
  };

  const handleCompleteTask = async () => {
    try {
      setIsLoading(true);

      // Check if there is at least one evidence block
      if (blocks.length === 0) {
        if (onError) {
          onError('At least one piece of evidence is required to complete a task. Please add text, images, links, or documents to your evidence.');
        }
        setIsLoading(false);
        return;
      }

      // Check if any uploads are still in progress
      if (uploadingBlocks && uploadingBlocks.size > 0) {
        if (onError) {
          onError('Please wait for file uploads to complete before submitting.');
        }
        setIsLoading(false);
        return;
      }

      // CRITICAL: Disable auto-save permanently BEFORE sending the completion request
      // This prevents any pending auto-save from overwriting the 'completed' status with 'draft'
      if (autoSaverRef.current && autoSaverRef.current.disableAutoSave) {
        logger.debug('[EVIDENCE] Disabling auto-save permanently to prevent race condition');
        autoSaverRef.current.disableAutoSave();
      } else if (autoSaverRef.current) {
        logger.debug('[EVIDENCE] Clearing auto-save (disableAutoSave not available)');
        autoSaverRef.current.clearAutoSave();
      }

      // Use flushSync to immediately update documentStatus to 'completed'
      // This prevents the auto-save effect from triggering with status='draft'
      flushSync(() => {
        setDocumentStatus('completed');
      });

      // Save and complete the task (files are already uploaded)
      const cleanedBlocks = cleanBlocksForSave(blocks);
      logger.debug('[EVIDENCE] Submitting task completion with status: completed');
      logger.debug('[EVIDENCE] documentStatus set to completed before request');

      const completeResponse = await evidenceDocumentService.saveDocument(taskId, cleanedBlocks, 'completed');

      if (completeResponse.success) {
        logger.debug('[EVIDENCE] Task completion successful');

        // Set save status
        flushSync(() => {
          setSaveStatus('saved');
        });
        logger.debug('[EVIDENCE] State updated - task marked as completed');

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
      logger.error('Error completing task:', error);
      if (onError) {
        // Extract error message from API response
        const errorMessage = error.response?.data?.error ||
                            error.response?.data?.message ||
                            error.message ||
                            'Failed to complete task.';
        onError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Manual save function
  const saveNow = async () => {
    if (blocks.length === 0) return { success: true };

    // Clear any pending auto-save to prevent it from overwriting our status
    if (autoSaverRef.current?.clearAutoSave) {
      autoSaverRef.current.clearAutoSave();
    }

    try {
      setSaveStatus('saving');
      const cleanedBlocks = cleanBlocksForSave(blocks);
      const result = await evidenceDocumentService.saveDocument(taskId, cleanedBlocks, 'draft');
      setSaveStatus('saved');
      setLastSaved(new Date());

      // Update block IDs if returned - set flag to skip auto-save trigger
      if (result.blocks && Array.isArray(result.blocks) && result.blocks.length > 0) {
        skipNextAutoSaveRef.current = true;
        setBlocks(prevBlocks => {
          if (prevBlocks.length === 0) return prevBlocks;
          return prevBlocks.map((block, index) => {
            const savedBlock = result.blocks.find(sb => sb.order_index === index);
            if (savedBlock?.id && savedBlock.id !== block.id) {
              return { ...block, id: savedBlock.id };
            }
            return block;
          });
        });
      }

      return { success: true };
    } catch (error) {
      setSaveStatus('unsaved');
      return { success: false, error: error.message };
    }
  };

  // Expose methods and state to parent component via ref
  useImperativeHandle(ref, () => ({
    addBlock,
    submitTask: () => setShowCompleteConfirm(true),
    getSaveStatus: () => ({ saveStatus, lastSaved }),
    saveNow
  }));

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
    <div className="w-full">
      {/* Legacy toolbar - hidden by default with new inline adders */}
      {!hideHeader && <EvidenceToolbar hideHeader={hideHeader} />}

      {/* Empty State - Inline Block Adder */}
      {blocks.length === 0 ? (
        <InlineBlockAdder mode="empty" onAddBlock={addBlock} />
      ) : (
        /* Evidence Blocks with inline adders between */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={blocks.map(b => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {blocks.map((block, index) => (
                <SortableBlock key={block.id} block={block} index={index}>
                  <EvidenceBlockRenderer
                    block={block}
                    index={index}
                    mediaHandlers={mediaHandlers}
                    addBlock={addBlock}
                    updateBlock={updateBlock}
                    deleteBlock={deleteBlock}
                    isNew={newBlockIds.has(block.id)}
                  />
                </SortableBlock>
              ))}
            </div>
          </SortableContext>

          {/* Always visible add block button at bottom */}
          <div className="mt-4">
            <InlineBlockAdder mode="empty" onAddBlock={addBlock} />
          </div>
        </DndContext>
      )}

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

MultiFormatEvidenceEditorInner.displayName = 'MultiFormatEvidenceEditorInner';

// Wrapper component that provides context
const MultiFormatEvidenceEditor = forwardRef(({
  taskId,
  userId,
  legacyEvidenceText,
  onComplete,
  onError,
  autoSaveEnabled = true,
  hideHeader = false
}, ref) => {
  return (
    <EvidenceEditorProvider
      taskId={taskId}
      userId={userId}
      legacyEvidenceText={legacyEvidenceText}
      onComplete={onComplete}
      onError={onError}
      autoSaveEnabled={autoSaveEnabled}
    >
      <MultiFormatEvidenceEditorInner ref={ref} hideHeader={hideHeader} />
    </EvidenceEditorProvider>
  );
});

MultiFormatEvidenceEditor.displayName = 'MultiFormatEvidenceEditor';

export default MultiFormatEvidenceEditor;
