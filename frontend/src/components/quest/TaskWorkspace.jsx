import { useState, useEffect } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  TrophyIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Bars3Icon,
  TrashIcon
} from '@heroicons/react/24/outline';
import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';
import { getPillarData } from '../../utils/pillarMappings';
import { evidenceDocumentService } from '../../services/evidenceDocumentService';
import logger from '../../utils/logger';
import EvidenceDisplay from '../evidence/EvidenceDisplay';
import AddEvidenceModal from '../evidence/AddEvidenceModal';
import SubjectBadges from '../common/SubjectBadges';

// Sortable Task Item for the collapsible list
const SortableTaskItem = ({ task, isSelected, onClick, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const pillarData = getPillarData(task.pillar);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`
        group flex items-start gap-2 px-3 py-3 rounded-lg cursor-pointer transition-all min-h-[56px]
        ${isSelected
          ? 'bg-optio-purple/10 border-l-4 border-optio-purple'
          : 'hover:bg-gray-50 border-l-4 border-transparent'
        }
        ${task.is_completed ? 'opacity-60' : ''}
      `}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 p-3 -m-2 min-w-[44px] min-h-[44px] touch-manipulation flex-shrink-0 flex items-center justify-center"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <Bars3Icon className="w-5 h-5" />
      </button>

      {/* Completion indicator */}
      {task.is_completed ? (
        <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
      ) : (
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
          style={{ backgroundColor: pillarData.color }}
        />
      )}

      {/* Task title - full text, no truncation */}
      <span className={`flex-1 text-sm leading-snug ${isSelected ? 'font-medium text-gray-900' : 'text-gray-700'}`} style={{ fontFamily: 'Poppins' }}>
        {task.title}
      </span>

      {/* XP and Delete in a column */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-xs text-gray-400">{task.xp_amount}</span>
        {/* Delete - hover only */}
        {onRemove && !task.is_completed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(task.id);
            }}
            className="sm:opacity-0 sm:group-hover:opacity-100 p-2 min-w-[44px] min-h-[44px] text-red-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 rounded transition-all touch-manipulation flex items-center justify-center"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

const TaskWorkspace = ({
  task,
  tasks = [],
  questId,
  onTaskSelect,
  onTaskReorder,
  onTaskComplete,
  onAddTask,
  onRemoveTask,
  onClose
}) => {
  const [error, setError] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [evidenceBlocks, setEvidenceBlocks] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTaskListOpen, setIsTaskListOpen] = useState(true);
  const [editingBlock, setEditingBlock] = useState(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Drag sensors for task reordering
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  // Load existing evidence when task changes and reset description state
  useEffect(() => {
    setIsDescriptionExpanded(false);
    if (task?.id) {
      loadEvidence();
    } else {
      setEvidenceBlocks([]);
    }
  }, [task?.id]);

  const loadEvidence = async () => {
    if (!task?.id) return;

    setIsLoading(true);
    try {
      const result = await evidenceDocumentService.getDocument(task.id);
      if (result.success && result.blocks) {
        // Normalize blocks and filter out invalid blob URLs
        const normalizedBlocks = result.blocks.map(block => {
          const type = block.type || block.block_type || 'text';

          // For blocks with items (images, videos, links, documents), filter out blob URLs
          if (block.content?.items && Array.isArray(block.content.items)) {
            const validItems = block.content.items.filter(item => {
              // Filter out blob URLs - they're invalid after page reload
              if (item.url && item.url.startsWith('blob:')) {
                return false;
              }
              return item.url; // Keep only items with valid URLs
            });

            return {
              ...block,
              type,
              content: { items: validItems }
            };
          }

          return { ...block, type };
        }).filter(block => {
          // Remove blocks that have no content after filtering
          if (block.type !== 'text' && block.content?.items?.length === 0) {
            return false;
          }
          return true;
        });

        setEvidenceBlocks(normalizedBlocks);
      } else {
        setEvidenceBlocks([]);
      }
    } catch (err) {
      logger.error('Failed to load evidence:', err);
      setEvidenceBlocks([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Save evidence blocks
  const saveEvidence = async (blocks, status = 'draft') => {
    if (!task?.id) return { success: false };

    setIsSaving(true);
    try {
      const cleanedBlocks = blocks.map((block, index) => {
        // Normalize type field - database returns block_type, frontend uses type
        const blockType = block.type || block.block_type || 'text';
        return {
          ...block,
          type: blockType, // Ensure 'type' field is set for backend
          order: index,
          content: cleanContentForSave(block.content, blockType)
        };
      });

      const result = await evidenceDocumentService.saveDocument(task.id, cleanedBlocks, status);

      if (result.success && result.blocks && result.blocks.length > 0) {
        setEvidenceBlocks(prevBlocks =>
          prevBlocks.map((block, index) => {
            const savedBlock = result.blocks.find(sb => sb.order_index === index);
            if (savedBlock?.id && savedBlock.id !== block.id) {
              return { ...block, id: savedBlock.id };
            }
            return block;
          })
        );
      }

      return result;
    } catch (err) {
      logger.error('Failed to save evidence:', err);
      return { success: false, error: err.message };
    } finally {
      setIsSaving(false);
    }
  };

  const cleanContentForSave = (content, type) => {
    if (type === 'text') {
      return { text: content.text || '' };
    }
    if (content.items && Array.isArray(content.items)) {
      return {
        items: content.items
          .filter(item => {
            // Filter out items with blob URLs (upload failed or not completed)
            if (item.url && item.url.startsWith('blob:')) {
              logger.warn('Filtering out item with blob URL - upload may have failed:', item.filename);
              return false;
            }
            // Filter out items without URLs
            if (!item.url) {
              return false;
            }
            return true;
          })
          .map(item => {
            const { file, ...rest } = item;
            return rest;
          })
      };
    }
    return content;
  };

  const handleSaveEvidence = async (newItems) => {
    let uploadFailures = 0;

    const processedItems = await Promise.all(
      newItems.map(async (item) => {
        if ((item.type === 'image' || item.type === 'document') && item.content.items) {
          const uploadedItems = await Promise.all(
            item.content.items.map(async (contentItem) => {
              // Only upload if there's a file object (new upload)
              if (contentItem.file) {
                try {
                  const uploadResult = await evidenceDocumentService.uploadFile(contentItem.file, task.id);
                  if (uploadResult.success && uploadResult.url) {
                    logger.debug('Upload successful:', uploadResult.url);
                    return { ...contentItem, url: uploadResult.url, file: undefined };
                  } else {
                    logger.error('Upload failed - no URL returned');
                    uploadFailures++;
                    return null; // Mark for removal
                  }
                } catch (err) {
                  logger.error('File upload failed:', err);
                  uploadFailures++;
                  return null; // Mark for removal
                }
              }
              // Keep existing items that already have valid URLs
              if (contentItem.url && !contentItem.url.startsWith('blob:')) {
                return contentItem;
              }
              // Filter out blob URLs without files (shouldn't happen but safety check)
              return null;
            })
          );
          // Filter out null items (failed uploads)
          const validItems = uploadedItems.filter(item => item !== null);
          return { ...item, content: { items: validItems } };
        }
        return item;
      })
    );

    // Filter out blocks with no content
    const validProcessedItems = processedItems.filter(item => {
      if (item.type !== 'text' && (!item.content.items || item.content.items.length === 0)) {
        return false;
      }
      return true;
    });

    if (uploadFailures > 0) {
      toast.error(`${uploadFailures} file(s) failed to upload`);
    }

    if (validProcessedItems.length === 0 && uploadFailures > 0) {
      toast.error('No evidence was saved due to upload failures');
      return;
    }

    const updatedBlocks = [...evidenceBlocks, ...validProcessedItems];
    setEvidenceBlocks(updatedBlocks);

    const result = await saveEvidence(updatedBlocks);
    if (!result.success) {
      toast.error('Failed to save evidence');
    }
  };

  const handleDeleteEvidence = async (blockId) => {
    const updatedBlocks = evidenceBlocks.filter(b => b.id !== blockId);
    setEvidenceBlocks(updatedBlocks);

    const result = await saveEvidence(updatedBlocks);
    if (result.success) {
      toast.success('Evidence removed');
    } else {
      setEvidenceBlocks(evidenceBlocks);
      toast.error('Failed to remove evidence');
    }
  };

  // Handle deleting individual item from a block (e.g., single image from image block)
  const handleDeleteItem = async (blockId, itemIndex, remainingItems) => {
    const updatedBlocks = evidenceBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          content: { items: remainingItems }
        };
      }
      return block;
    });
    setEvidenceBlocks(updatedBlocks);

    const result = await saveEvidence(updatedBlocks);
    if (!result.success) {
      setEvidenceBlocks(evidenceBlocks);
      toast.error('Failed to remove item');
    }
  };

  // Handle reordering blocks via drag and drop
  const handleReorder = async (oldIndex, newIndex) => {
    const reorderedBlocks = [...evidenceBlocks];
    const [movedBlock] = reorderedBlocks.splice(oldIndex, 1);
    reorderedBlocks.splice(newIndex, 0, movedBlock);
    setEvidenceBlocks(reorderedBlocks);

    const result = await saveEvidence(reorderedBlocks);
    if (!result.success) {
      setEvidenceBlocks(evidenceBlocks);
      toast.error('Failed to reorder evidence');
    }
  };

  // Handle opening edit modal for a block
  const handleEditEvidence = (block) => {
    setEditingBlock(block);
    setIsModalOpen(true);
  };

  // Handle updating a block after editing
  const handleUpdateEvidence = async (updatedBlock) => {
    // Handle file uploads if any new files were added
    let processedBlock = updatedBlock;
    let uploadFailures = 0;

    if ((updatedBlock.type === 'image' || updatedBlock.type === 'document') && updatedBlock.content?.items) {
      const uploadedItems = await Promise.all(
        updatedBlock.content.items.map(async (item) => {
          // Only upload if there's a file object (new upload)
          if (item.file) {
            try {
              const uploadResult = await evidenceDocumentService.uploadFile(item.file, task.id);
              if (uploadResult.success && uploadResult.url) {
                return { ...item, url: uploadResult.url, file: undefined };
              } else {
                uploadFailures++;
                return null;
              }
            } catch (err) {
              logger.error('File upload failed:', err);
              uploadFailures++;
              return null;
            }
          }
          // Keep existing items that already have valid URLs
          if (item.url && !item.url.startsWith('blob:')) {
            return item;
          }
          return null;
        })
      );

      // Filter out null items (failed uploads)
      const validItems = uploadedItems.filter(item => item !== null);
      processedBlock = { ...updatedBlock, content: { items: validItems } };
    }

    if (uploadFailures > 0) {
      toast.error(`${uploadFailures} file(s) failed to upload`);
    }

    const updatedBlocks = evidenceBlocks.map(block =>
      block.id === processedBlock.id ? processedBlock : block
    );
    setEvidenceBlocks(updatedBlocks);
    setEditingBlock(null);

    const result = await saveEvidence(updatedBlocks);
    if (!result.success) {
      setEvidenceBlocks(evidenceBlocks);
      toast.error('Failed to update evidence');
    }
  };

  // Handle closing modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingBlock(null);
  };

  const handleMarkComplete = async () => {
    if (isCompleting) return;

    setIsCompleting(true);
    setError('');

    try {
      const result = await saveEvidence(evidenceBlocks, 'completed');

      if (result.success) {
        const pillarData = getPillarData(task.pillar);
        const duration = 2000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(() => {
          const timeLeft = animationEnd - Date.now();
          if (timeLeft <= 0) {
            clearInterval(interval);
            return;
          }
          const particleCount = 50 * (timeLeft / duration);
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
            colors: [pillarData.color, '#6D469B', '#EF597B', '#FFD700']
          });
          confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
            colors: [pillarData.color, '#6D469B', '#EF597B', '#FFD700']
          });
        }, 250);

        if (onTaskComplete) {
          onTaskComplete({
            task,
            xp_awarded: result.xp_awarded || task.xp_amount,
            message: `Task completed! You earned ${result.xp_awarded || task.xp_amount} XP`
          });
        }
      } else {
        setError(result.error || 'Failed to complete task');
      }
    } catch (err) {
      logger.error('Error completing task:', err);
      setError(err.message || 'Failed to complete task');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex(t => t.id === active.id);
    const newIndex = tasks.findIndex(t => t.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1 && onTaskReorder) {
      onTaskReorder(oldIndex, newIndex);
    }
  };

  const pillarData = task ? getPillarData(task.pillar) : null;
  const isTaskCompleted = task?.is_completed || false;

  // Split tasks
  const activeTasks = tasks.filter(t => !t.is_completed);
  const completedTasks = tasks.filter(t => t.is_completed);

  return (
    <div className="h-full flex flex-col">
      {/* Full-width Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
        {task ? (
          <div className="space-y-2">
            {/* Title - always fully visible, wraps on mobile */}
            <h2 className="text-base sm:text-xl font-bold text-gray-900 break-words" style={{ fontFamily: 'Poppins' }}>
              {task.title}
            </h2>
            {/* Description - expandable on tap */}
            {task.description && (
              <div>
                <p
                  className={`text-sm text-gray-600 ${isDescriptionExpanded ? '' : 'line-clamp-2'}`}
                  style={{ fontFamily: 'Poppins' }}
                >
                  {task.description}
                </p>
                {task.description.length > 100 && (
                  <button
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="text-xs text-optio-purple font-medium mt-1 touch-manipulation min-h-[32px] flex items-center"
                    style={{ fontFamily: 'Poppins' }}
                  >
                    {isDescriptionExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            )}
            {/* Pillar and XP badges - below title/description */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="px-3 py-1 rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: pillarData?.color, fontFamily: 'Poppins' }}
                >
                  {pillarData?.name}
                </div>
                <div
                  className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"
                  style={{
                    backgroundColor: `${pillarData?.color}20`,
                    color: pillarData?.color,
                    fontFamily: 'Poppins'
                  }}
                >
                  <TrophyIcon className="w-3.5 h-3.5" />
                  {task.xp_amount} XP
                </div>
              </div>
              {/* Subject XP Distribution */}
              {(task.subject_xp_distribution || task.school_subjects) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500" style={{ fontFamily: 'Poppins' }}>Credits:</span>
                  <SubjectBadges
                    subjectXpDistribution={task.subject_xp_distribution || task.school_subjects}
                    compact={false}
                    maxDisplay={3}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-gray-400">
            <p className="font-medium" style={{ fontFamily: 'Poppins' }}>Select a task to get started</p>
          </div>
        )}
      </div>

      {/* Content Area with Collapsible Sidebar */}
      <div className="flex-1 flex min-h-0">
        {/* Expand button when collapsed */}
        {!isTaskListOpen && (
          <button
            onClick={() => setIsTaskListOpen(true)}
            className="flex-shrink-0 w-8 border-r border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-center group"
            title="Show task list"
          >
            <ChevronRightIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
          </button>
        )}

        {/* Collapsible Task List Panel */}
        <div className={`
          ${isTaskListOpen ? 'w-64' : 'w-0'}
          flex-shrink-0 border-r border-gray-200 transition-all duration-300 overflow-hidden
        `}>
          <div className="h-full flex flex-col w-64">
            {/* Task List Header */}
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>
                Tasks ({tasks.length})
              </span>
              <button
                onClick={() => setIsTaskListOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                title="Hide task list"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Task List */}
            <div className="flex-1 overflow-y-auto py-2">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={activeTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  {activeTasks.map((t) => (
                    <SortableTaskItem
                      key={t.id}
                      task={t}
                      isSelected={t.id === task?.id}
                      onClick={() => onTaskSelect?.(t)}
                      onRemove={onRemoveTask}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Completed Tasks */}
              {completedTasks.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="px-3 mb-2">
                    <span className="text-xs text-gray-400" style={{ fontFamily: 'Poppins' }}>
                      Completed ({completedTasks.length})
                    </span>
                  </div>
                  {completedTasks.map((t) => (
                    <SortableTaskItem
                      key={t.id}
                      task={t}
                      isSelected={t.id === task?.id}
                      onClick={() => onTaskSelect?.(t)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Add Task Button */}
            {onAddTask && (
              <div className="p-2 border-t border-gray-100">
                <button
                  onClick={onAddTask}
                  className="w-full py-2 text-sm text-optio-purple hover:bg-optio-purple/5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  style={{ fontFamily: 'Poppins' }}
                >
                  <PlusIcon className="w-4 h-4" />
                  Add Task
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Content */}
          {task ? (
            <div className="flex-1 overflow-y-auto">
              {/* Sticky Header with My Evidence + Action Buttons */}
              <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-3 sm:px-6 py-2 sm:py-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap" style={{ fontFamily: 'Poppins' }}>
                    My Evidence
                  </h3>
                  <div className="flex items-center gap-1 sm:gap-2">
                    {/* Save Button - icon only on mobile */}
                    <button
                      onClick={() => saveEvidence(evidenceBlocks)}
                      disabled={isSaving || evidenceBlocks.length === 0}
                      className="flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 touch-manipulation"
                      style={{ fontFamily: 'Poppins' }}
                      title="Save"
                    >
                      {isSaving ? (
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 sm:hidden">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
                          </svg>
                          <span className="hidden sm:inline">Save</span>
                        </>
                      )}
                    </button>

                    {/* Add Evidence Button - icon only on mobile */}
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-sm font-medium text-optio-purple hover:bg-optio-purple/10 border border-optio-purple/30 rounded-lg transition-colors min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 touch-manipulation"
                      style={{ fontFamily: 'Poppins' }}
                      title="Add Evidence"
                    >
                      <PlusIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">Add</span>
                    </button>

                    {/* Mark Complete Button - compact on mobile */}
                    {!isTaskCompleted ? (
                      <button
                        onClick={handleMarkComplete}
                        disabled={isCompleting || isSaving}
                        className="flex items-center justify-center gap-1 px-2.5 py-1.5 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px] touch-manipulation"
                        style={{ fontFamily: 'Poppins' }}
                      >
                        {isCompleting ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <CheckCircleIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">Done</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-4 sm:py-1.5 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircleIcon className="w-4 h-4 text-green-600" />
                        <span className="text-green-700 text-xs sm:text-sm font-semibold whitespace-nowrap" style={{ fontFamily: 'Poppins' }}>
                          <span className="sm:hidden">+{task.xp_amount} XP</span>
                          <span className="hidden sm:inline">Completed! +{task.xp_amount} XP</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6">
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <ExclamationCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
                      <span className="text-red-700 text-sm" style={{ fontFamily: 'Poppins' }}>{error}</span>
                    </div>
                  </div>
                )}

                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-optio-purple border-t-transparent rounded-full animate-spin" />
                      <span className="text-gray-500 text-sm">Loading evidence...</span>
                    </div>
                  </div>
                ) : (
                  <EvidenceDisplay
                    blocks={evidenceBlocks}
                    onDelete={handleDeleteEvidence}
                    onDeleteItem={handleDeleteItem}
                    onReorder={handleReorder}
                    onEdit={handleEditEvidence}
                    emptyMessage="No evidence yet. Click 'Add Evidence' to show your work."
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <TrophyIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg" style={{ fontFamily: 'Poppins' }}>Select a task from the list</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Evidence Modal */}
      <AddEvidenceModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveEvidence}
        onUpdate={handleUpdateEvidence}
        editingBlock={editingBlock}
        existingEvidence={evidenceBlocks}
      />
    </div>
  );
};

export default TaskWorkspace;
