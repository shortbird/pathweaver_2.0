import { useState, useEffect } from 'react';
import { PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { TrophyIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';
import { getPillarData } from '../../utils/pillarMappings';
import { evidenceDocumentService } from '../../services/evidenceDocumentService';
import logger from '../../utils/logger';
import api from '../../services/api';
import AddEvidenceModal from '../evidence/AddEvidenceModal';
import TaskStepsModal from './TaskStepsModal';
import StudentTaskEditModal from './StudentTaskEditModal';
import { useAIAccess } from '../../contexts/AIAccessContext';
import { useAuth } from '../../contexts/AuthContext';
import useHidePillars from '../../hooks/useHidePillars';

// QF-02: the sidebar, the phone picker and the two halves of the detail pane
// each live in their own file now. This component keeps the state and the
// handlers -- they are shared by all four -- and the layout that arranges them.
import MobileTaskPicker from './taskWorkspace/MobileTaskPicker';
import TaskListPanel from './taskWorkspace/TaskListPanel';
import TaskDetailsSection from './taskWorkspace/TaskDetailsSection';
import TaskEvidenceSection from './taskWorkspace/TaskEvidenceSection';

const TaskWorkspace = ({
  task,
  tasks = [],
  questId,
  isClassQuest = false,
  showPillars = true,
  onTaskSelect,
  onTaskReorder,
  onTaskComplete,
  onTaskUpdate,
  onAddTask,
  onRemoveTask,
  onClose
}) => {
  const { canUseTaskGeneration } = useAIAccess();
  const { effectiveRole } = useAuth();
  // The prop is the per-quest rule (training quests hide pillars); the hook is
  // the per-school one. Either hiding wins, so callers get the org's setting
  // without every one of them having to pass it.
  const orgHidesPillars = useHidePillars();
  const pillarsVisible = showPillars && !orgHidesPillars;
  // Diploma credit is a student's. A guardian works through the quest their
  // school set for families on their own account, and requesting credit for it
  // would file "A student requested diploma credit…" into the org's review
  // queue for somebody who has no diploma.
  const canRequestCredit = effectiveRole !== 'parent';
  const [error, setError] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [evidenceBlocks, setEvidenceBlocks] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStepsModalOpen, setIsStepsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTaskListOpen, setIsTaskListOpen] = useState(true);
  const [editingBlock, setEditingBlock] = useState(null);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isRequestingCredit, setIsRequestingCredit] = useState(false);
  const [creditStatus, setCreditStatus] = useState(null); // tracks diploma_status for current task
  // Portfolio curation: the viewer's completion row for this task (own work only).
  const [portfolioPick, setPortfolioPick] = useState(null); // { completionId, inPortfolio }
  const [isTogglingPortfolio, setIsTogglingPortfolio] = useState(false);

  // Drag sensors for task reordering
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  // Load existing evidence and credit status when task changes
  useEffect(() => {
    setIsDescriptionExpanded(false);
    setCreditStatus(null);
    setPortfolioPick(null);
    if (task?.id) {
      loadEvidence();
      if (task.is_completed) {
        loadCreditStatus();
        loadPortfolioPick();
      }
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

  const loadCreditStatus = async () => {
    try {
      const response = await api.get(`/api/tasks/${task.id}/credit-status`);
      const data = response.data.data;
      if (data?.has_completion) {
        setCreditStatus(data.diploma_status);
      }
    } catch {
      // Not critical, silently ignore
    }
  };

  const loadPortfolioPick = async () => {
    try {
      const response = await api.get(`/api/portfolio/completions/by-task/${task.id}`);
      const data = response.data?.data || response.data;
      // Only the completion's owner (or a verified parent) gets a row back, so
      // the toggle simply never appears for anyone else.
      if (data?.has_completion) {
        setPortfolioPick({ completionId: data.completion_id, inPortfolio: !!data.in_portfolio });
      }
    } catch {
      // Non-critical — the toggle just stays hidden
    }
  };

  const handleTogglePortfolio = async () => {
    if (!portfolioPick?.completionId || isTogglingPortfolio) return;
    setIsTogglingPortfolio(true);
    const next = !portfolioPick.inPortfolio;
    try {
      await api.patch(`/api/portfolio/completions/${portfolioPick.completionId}/curate`, {
        in_portfolio: next
      });
      setPortfolioPick((prev) => ({ ...prev, inPortfolio: next }));
      toast.success(next ? 'Added to your portfolio picks' : 'Removed from portfolio picks');
    } catch {
      toast.error('Could not update your portfolio');
    } finally {
      setIsTogglingPortfolio(false);
    }
  };

  const handleRequestCredit = async () => {
    if (!task?.id) return;
    setIsRequestingCredit(true);
    try {
      const response = await api.post(`/api/tasks/${task.id}/request-credit`, {});
      const resData = response.data?.data || response.data;
      if (resData.success || ['pending_review', 'pending_org_approval'].includes(resData.diploma_status)) {
        setCreditStatus(resData.diploma_status || 'pending_review');
        toast.success(resData.message || 'Diploma credit requested!');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to request credit';
      toast.error(errorMsg);
    } finally {
      setIsRequestingCredit(false);
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
    const failureReasons = [];

    const hasFiles = newItems.some(item =>
      item.content?.items?.some(ci => ci.file)
    );
    const uploadToastId = hasFiles
      ? toast.loading('Uploading evidence...', { duration: Infinity })
      : null;

    const processedItems = await Promise.all(
      newItems.map(async (item) => {
        if ((item.type === 'image' || item.type === 'video' || item.type === 'document') && item.content.items) {
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
                    failureReasons.push(uploadResult.error || 'Upload failed');
                    return null; // Mark for removal
                  }
                } catch (err) {
                  logger.error('File upload failed:', err);
                  uploadFailures++;
                  const reason = err.response?.data?.error || err.message || 'Upload failed';
                  failureReasons.push(reason);
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
      const reason = failureReasons[0] || 'Unknown error';
      toast.error(`Upload failed: ${reason}`);
    }

    if (validProcessedItems.length === 0 && uploadFailures > 0) {
      if (uploadToastId) toast.dismiss(uploadToastId);
      toast.error('No evidence was saved. Please try again.');
      return;
    }

    if (uploadToastId) toast.loading('Saving evidence...', { id: uploadToastId, duration: Infinity });

    const updatedBlocks = [...evidenceBlocks, ...validProcessedItems];
    setEvidenceBlocks(updatedBlocks);

    const result = await saveEvidence(updatedBlocks);
    if (uploadToastId) toast.dismiss(uploadToastId);
    if (!result.success) {
      toast.error('Failed to save evidence');
    } else if (validProcessedItems.length > 0) {
      toast.success('Evidence saved');
    }
  };

  // Collect Supabase storage URLs from a block's content
  const collectStorageUrls = (content) => {
    const urls = [];
    if (!content) return urls;
    if (content.url && content.url.includes('supabase.co')) urls.push(content.url);
    if (content.items) {
      content.items.forEach(item => {
        if (item.url && item.url.includes('supabase.co')) urls.push(item.url);
      });
    }
    return urls;
  };

  const handleDeleteEvidence = async (blockId) => {
    const deletedBlock = evidenceBlocks.find(b => b.id === blockId);
    const updatedBlocks = evidenceBlocks.filter(b => b.id !== blockId);
    setEvidenceBlocks(updatedBlocks);

    const result = await saveEvidence(updatedBlocks);
    if (result.success) {
      toast.success('Evidence removed');
      // Clean up storage files in background
      const urls = collectStorageUrls(deletedBlock?.content);
      if (urls.length > 0) {
        evidenceDocumentService.deleteStorageUrls(urls);
      }
    } else {
      setEvidenceBlocks(evidenceBlocks);
      toast.error('Failed to remove evidence');
    }
  };

  // Handle deleting individual item from a block (e.g., single image from image block)
  const handleDeleteItem = async (blockId, itemIndex, remainingItems) => {
    const block = evidenceBlocks.find(b => b.id === blockId);
    const removedItem = block?.content?.items?.[itemIndex];

    const updatedBlocks = evidenceBlocks.map(b => {
      if (b.id === blockId) {
        return { ...b, content: { items: remainingItems } };
      }
      return b;
    });
    setEvidenceBlocks(updatedBlocks);

    const result = await saveEvidence(updatedBlocks);
    if (!result.success) {
      setEvidenceBlocks(evidenceBlocks);
      toast.error('Failed to remove item');
    } else {
      // Clean up storage file in background
      if (removedItem?.url && removedItem.url.includes('supabase.co')) {
        evidenceDocumentService.deleteStorageUrls([removedItem.url]);
      }
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
    const failureReasons = [];

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
                failureReasons.push(uploadResult.error || 'Upload failed');
                return null;
              }
            } catch (err) {
              logger.error('File upload failed:', err);
              uploadFailures++;
              failureReasons.push(err.response?.data?.error || err.message || 'Upload failed');
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
      const reason = failureReasons[0] || 'Unknown error';
      toast.error(`Upload failed: ${reason}`);
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

    // Check if there is at least one evidence block
    if (!evidenceBlocks || evidenceBlocks.length === 0) {
      setError('At least one piece of evidence is required to complete a task. Please add text, images, links, or documents to your evidence.');
      return;
    }

    setIsCompleting(true);
    setError('');

    try {
      const result = await saveEvidence(evidenceBlocks, 'completed');

      if (result.success) {
        // A freshly completed task has diploma_status 'none'. Set it now so the
        // "Request Credit" button appears immediately — the task stays selected,
        // so the [task.id] effect that normally loads credit status won't re-run.
        setCreditStatus('none');
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
      // Extract error message from API response
      const errorMessage = err.response?.data?.error ||
                          err.response?.data?.message ||
                          err.message ||
                          'Failed to complete task';
      setError(errorMessage);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSaveTaskEdit = async ({ pillar, xp_value, diploma_subjects }) => {
    if (!task?.id) return;
    const payload = { pillar, xp_value };
    if (diploma_subjects !== undefined) payload.diploma_subjects = diploma_subjects;
    const response = await api.put(`/api/tasks/${task.id}`, payload);
    const updated = response?.data?.task;
    if (updated && onTaskUpdate) {
      onTaskUpdate(updated);
    }
    toast.success('Task updated');
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

  // Handle moving a task up in the list (mobile reordering)
  const handleMoveUp = (taskId) => {
    const currentIndex = tasks.findIndex(t => t.id === taskId);
    const taskAbove = currentIndex > 0 ? tasks[currentIndex - 1] : null;
    // Don't move if first task or if task above is required
    if (currentIndex > 0 && !taskAbove?.is_required && onTaskReorder) {
      onTaskReorder(currentIndex, currentIndex - 1);
    }
  };

  // Handle moving a task down in the list (mobile reordering)
  const handleMoveDown = (taskId) => {
    const currentIndex = tasks.findIndex(t => t.id === taskId);
    if (currentIndex < tasks.length - 1 && onTaskReorder) {
      onTaskReorder(currentIndex, currentIndex + 1);
    }
  };

  const pillarData = task ? getPillarData(task.pillar) : null;
  const isTaskCompleted = task?.is_completed || false;

  // Split tasks
  const activeTasks = tasks.filter(t => !t.is_completed);
  const completedTasks = tasks.filter(t => t.is_completed);

  return (
    <div className="h-full flex flex-col sm:flex-row">
      {/* Mobile: Task Dropdown */}
      <MobileTaskPicker
        task={task} tasks={tasks}
        activeTasks={activeTasks} completedTasks={completedTasks}
        onTaskSelect={onTaskSelect} onAddTask={onAddTask}
      />

      {/* Desktop: Content Area with Full-Height Sidebar */}
        {/* Expand button when collapsed */}
        {!isTaskListOpen && (
          <button
            onClick={() => setIsTaskListOpen(true)}
            className="hidden sm:flex flex-shrink-0 w-8 border-r border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors items-center justify-center group"
            title="Show task list"
          >
            <ChevronRightIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
          </button>
        )}

        {/* Collapsible Task List Panel (desktop only) */}
        <TaskListPanel
          task={task} tasks={tasks}
          activeTasks={activeTasks} completedTasks={completedTasks}
          isTaskListOpen={isTaskListOpen} setIsTaskListOpen={setIsTaskListOpen}
          sensors={sensors} handleDragEnd={handleDragEnd}
          handleMoveUp={handleMoveUp} handleMoveDown={handleMoveDown}
          onTaskSelect={onTaskSelect} onRemoveTask={onRemoveTask} onAddTask={onAddTask}
        />

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Content */}
          {task ? (
            <div className="flex-1 overflow-y-auto">
              <TaskDetailsSection
                task={task} pillarData={pillarData} pillarsVisible={pillarsVisible}
                canUseTaskGeneration={canUseTaskGeneration}
                isDescriptionExpanded={isDescriptionExpanded}
                setIsDescriptionExpanded={setIsDescriptionExpanded}
                setIsStepsModalOpen={setIsStepsModalOpen}
                setIsEditModalOpen={setIsEditModalOpen}
              />

              <TaskEvidenceSection
                task={task} evidenceBlocks={evidenceBlocks}
                isLoading={isLoading} isSaving={isSaving} error={error}
                isTaskCompleted={isTaskCompleted} isCompleting={isCompleting}
                isClassQuest={isClassQuest}
                creditStatus={creditStatus} canRequestCredit={canRequestCredit}
                isRequestingCredit={isRequestingCredit}
                portfolioPick={portfolioPick} isTogglingPortfolio={isTogglingPortfolio}
                setIsModalOpen={setIsModalOpen}
                handleEditEvidence={handleEditEvidence}
                handleDeleteEvidence={handleDeleteEvidence}
                handleDeleteItem={handleDeleteItem}
                handleReorder={handleReorder}
                handleMarkComplete={handleMarkComplete}
                handleRequestCredit={handleRequestCredit}
                handleTogglePortfolio={handleTogglePortfolio}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <TrophyIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Select a task from the list</p>
              </div>
            </div>
          )}
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

      {/* Task Steps Modal - AI-powered step breakdown */}
      <TaskStepsModal
        isOpen={isStepsModalOpen}
        onClose={() => setIsStepsModalOpen(false)}
        taskId={task?.id}
        taskTitle={task?.title}
        isTaskCompleted={task?.is_completed}
      />

      {/* Student edit modal — pillar, XP, and diploma credit (subjects hidden
          for class quests, whose credit is locked to the class subject) */}
      {isEditModalOpen && task && (
        <StudentTaskEditModal
          task={task}
          isClassQuest={isClassQuest}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveTaskEdit}
        />
      )}
    </div>
  );
};

export default TaskWorkspace;
