import { useState, useEffect } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Bars3Icon,
  CheckCircleIcon,
  ClockIcon,
  ChevronRightIcon,
  XMarkIcon,
  ClipboardDocumentListIcon,
  SparklesIcon,
  LockClosedIcon,
  LockOpenIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { getPillarData } from '../../utils/pillarMappings';
import LessonContentRenderer from './LessonContentRenderer';
import api from '../../services/api';

const LessonItem = ({ lesson, index, isSelected, isAdmin, isLocked, isUnlocked, xpProgress, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: lesson.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isCompleted = lesson.is_completed || false;
  const pillarData = getPillarData(lesson.pillar || 'art');

  return (
    <div
      ref={setNodeRef}
      onClick={isLocked ? undefined : onClick}
      className={`
        relative rounded-lg p-3 mb-2 transition-all duration-200
        ${isLocked
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:border-gray-300 hover:shadow-lg hover:scale-[1.02]'
        }
        ${isSelected
          ? 'border-2 shadow-md scale-[1.02]'
          : 'border border-gray-200'
        }
      `}
      style={{
        ...style,
        borderColor: isSelected ? pillarData.color : undefined,
        backgroundColor: isLocked ? '#f3f4f6' : (isSelected ? `${pillarData.color}15` : (isCompleted ? '#f0fdf4' : 'white'))
      }}
    >
      {/* Drag Handle (Admin Only) */}
      {isAdmin && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <Bars3Icon className="w-4 h-4 text-gray-400" />
        </div>
      )}

      <div className={`flex items-center gap-2.5 ${isAdmin ? 'pl-6' : ''}`}>
        {/* Lesson Number Badge */}
        <div className="relative flex-shrink-0">
          <div
            className={`w-8 h-8 rounded-md flex items-center justify-center font-semibold text-sm ${isLocked ? 'bg-gray-400' : ''}`}
            style={!isLocked ? {
              backgroundImage: `linear-gradient(135deg, ${pillarData.color}ee, ${pillarData.color}88)`,
              color: 'white'
            } : { color: 'white' }}
          >
            {isLocked ? <LockClosedIcon className="w-4 h-4" /> : index + 1}
          </div>
          {/* Completion Overlay */}
          {isCompleted && !isLocked && (
            <div className="absolute inset-0 bg-green-600/30 rounded-md flex items-center justify-center">
              <CheckCircleIcon className="w-5 h-5 text-green-600" strokeWidth={2.5} />
            </div>
          )}
        </div>

        {/* Lesson Info */}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold truncate mb-1 ${isLocked ? 'text-gray-500' : 'text-gray-900'}`}>
            {lesson.title || `Lesson ${index + 1}`}
          </div>
          {isLocked && xpProgress ? (
            <div className="flex items-center gap-1 text-xs text-amber-600">
              <span>Complete Lesson {xpProgress.blockingLessonIndex}: {xpProgress.earned}/{xpProgress.required} XP</span>
            </div>
          ) : isLocked ? (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span>Complete previous lessons first</span>
            </div>
          ) : isUnlocked ? (
            <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <LockOpenIcon className="w-3 h-3" />
              <span>Unlocked</span>
            </div>
          ) : lesson.duration_minutes ? (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <ClockIcon className="w-3 h-3" />
              <span>{lesson.duration_minutes} min</span>
            </div>
          ) : null}
        </div>

        {isLocked ? (
          <LockClosedIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </div>
    </div>
  );
};

const CurriculumView = ({
  lessons: propLessons,
  selectedLessonId: propSelectedLessonId,
  onLessonSelect,
  onLessonsReorder,
  onTaskClick, // Callback when a linked task is clicked
  onGenerateTasks, // Callback to open AI task generation wizard
  orderingMode = 'sequential', // 'sequential' or 'free'
  isAdmin = false,
  className = '',
  questId // Optional: if provided, will fetch lessons automatically
}) => {
  // Start collapsed on mobile, open on desktop
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  const [fetchedLessons, setFetchedLessons] = useState([]);
  const [questTasks, setQuestTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [internalSelectedId, setInternalSelectedId] = useState(null);

  // Use prop lessons if provided, otherwise use fetched lessons
  const lessons = propLessons || fetchedLessons;
  const selectedLessonId = propSelectedLessonId ?? internalSelectedId;

  // Fetch lessons and tasks when questId is provided
  useEffect(() => {
    if (questId) {
      const fetchData = async () => {
        try {
          setLoading(true);

          // Fetch lessons if not provided via props
          if (!propLessons) {
            const lessonsResponse = await api.get(`/api/quests/${questId}/curriculum/lessons`);
            const lessonsData = lessonsResponse.data.lessons || [];
            setFetchedLessons(lessonsData);
            // Auto-select first lesson
            if (lessonsData.length > 0 && !internalSelectedId) {
              setInternalSelectedId(lessonsData[0].id);
            }
          }

          // Fetch quest tasks for linking
          try {
            const tasksResponse = await api.get(`/api/quests/${questId}/tasks`);
            setQuestTasks(tasksResponse.data.tasks || []);
          } catch (err) {
            console.warn('Could not fetch quest tasks:', err);
          }
        } catch (error) {
          console.error('Failed to fetch curriculum data:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchData();
    }
  }, [questId, propLessons]);

  // Handle internal lesson selection
  const handleLessonSelect = (lesson) => {
    if (onLessonSelect) {
      onLessonSelect(lesson);
    } else {
      setInternalSelectedId(lesson.id);
    }
    // Close sidebar on mobile after selection
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

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
        tolerance: 8,
      },
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over || !isAdmin) return;

    if (active.id !== over.id) {
      const oldIndex = lessons.findIndex(l => l.id === active.id);
      const newIndex = lessons.findIndex(l => l.id === over.id);

      // Create new order
      const reordered = [...lessons];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      if (onLessonsReorder) {
        onLessonsReorder(reordered);
      }
    }
  };

  const selectedLesson = lessons.find(l => l.id === selectedLessonId);

  // Get linked tasks for the selected lesson
  const getLinkedTasks = (lesson) => {
    if (!lesson?.linked_task_ids || lesson.linked_task_ids.length === 0) {
      return [];
    }
    return questTasks.filter(task => lesson.linked_task_ids.includes(task.id));
  };

  // Calculate earned XP for a lesson from completed linked tasks
  const getLessonEarnedXP = (lesson) => {
    const tasks = getLinkedTasks(lesson);
    return tasks.reduce((total, task) => {
      const isCompleted = task.approval_status === 'approved' || task.is_completed;
      return total + (isCompleted ? (task.xp_value || 0) : 0);
    }, 0);
  };

  // Check if a lesson is accessible based on previous lesson XP thresholds
  const isLessonAccessible = (lessonIndex) => {
    if (isAdmin) return true; // Admins can access all lessons
    if (lessonIndex === 0) return true; // First lesson is always accessible

    // Check the PREVIOUS lesson's XP threshold requirement
    // Each lesson's xp_threshold determines the XP needed to unlock the NEXT lesson
    const prevLesson = lessons[lessonIndex - 1];
    if (prevLesson?.xp_threshold && prevLesson.xp_threshold > 0) {
      const earnedXP = getLessonEarnedXP(prevLesson);
      if (earnedXP < prevLesson.xp_threshold) {
        return false;
      }
    }

    // Also check all prior lessons are unlocked (cascading requirement)
    if (lessonIndex > 1) {
      return isLessonAccessible(lessonIndex - 1);
    }

    return true;
  };

  const linkedTasks = selectedLesson ? getLinkedTasks(selectedLesson) : [];
  const selectedLessonEarnedXP = selectedLesson ? getLessonEarnedXP(selectedLesson) : 0;
  const selectedLessonXPThreshold = selectedLesson?.xp_threshold || 0;

  // Calculate progress
  const completedCount = lessons.filter(l => l.is_completed).length;
  const progressPercent = lessons.length > 0 ? (completedCount / lessons.length) * 100 : 0;

  return (
    <div className={`flex h-full relative ${className}`}>
      {/* Mobile overlay when sidebar is open */}
      {isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/30 z-10"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Lesson List */}
      <div
        className={`
          ${isSidebarOpen ? 'w-80 min-w-[280px] max-w-[320px]' : 'w-0'}
          transition-all duration-300 overflow-hidden
          border-r border-gray-200 bg-gray-50 flex flex-col
          ${isSidebarOpen ? 'absolute md:relative z-20 h-full md:h-auto' : ''}
        `}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900">Lessons</h3>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <XMarkIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Progress Bar with Milestone Dots */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Progress</span>
              <span>{completedCount} / {lessons.length}</span>
            </div>
            <div className="relative w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              {/* Animated Gradient */}
              <div
                className="h-full bg-gradient-to-r from-optio-purple via-optio-pink to-optio-purple transition-all duration-500 ease-out"
                style={{
                  width: `${progressPercent}%`,
                  backgroundSize: '200% 100%',
                  animation: progressPercent > 0 ? 'gradientShift 3s ease infinite' : 'none'
                }}
              />
              {/* Milestone Dots */}
              {[25, 50, 75].map((milestone) => (
                <div
                  key={milestone}
                  className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 transition-colors duration-300 ${
                    progressPercent >= milestone
                      ? 'bg-white border-optio-purple'
                      : 'bg-gray-200 border-gray-400'
                  }`}
                  style={{ left: `${milestone}%`, transform: 'translate(-50%, -50%)' }}
                  title={`${milestone}% milestone`}
                />
              ))}
            </div>
          </div>
          <style>{`
            @keyframes gradientShift {
              0%, 100% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
            }
          `}</style>
        </div>

        {/* Lesson List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
            </div>
          ) : lessons.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No lessons yet
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={lessons.map(l => l.id)}
                strategy={verticalListSortingStrategy}
              >
                {lessons.map((lesson, index) => {
                  const isLocked = !isLessonAccessible(index);

                  // Check if this lesson was unlocked by meeting XP threshold
                  // (not first lesson, previous lesson had threshold, and it was met)
                  let isUnlocked = false;
                  if (!isLocked && index > 0 && !isAdmin) {
                    const prevLesson = lessons[index - 1];
                    if (prevLesson?.xp_threshold && prevLesson.xp_threshold > 0) {
                      isUnlocked = true; // Previous lesson had a threshold that was met
                    }
                  }

                  // Get XP progress for locked lessons (threshold from the previous lesson)
                  let xpProgress = null;
                  if (isLocked && index > 0) {
                    // Find which previous lesson is blocking access
                    for (let i = index - 1; i >= 0; i--) {
                      const prevLesson = lessons[i];
                      if (prevLesson.xp_threshold && prevLesson.xp_threshold > 0) {
                        const earned = getLessonEarnedXP(prevLesson);
                        if (earned < prevLesson.xp_threshold) {
                          xpProgress = {
                            earned: earned,
                            required: prevLesson.xp_threshold,
                            blockingLessonIndex: i + 1
                          };
                          break;
                        }
                      }
                    }
                  }
                  return (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      index={index}
                      isSelected={lesson.id === selectedLessonId}
                      isAdmin={isAdmin}
                      isLocked={isLocked}
                      isUnlocked={isUnlocked}
                      xpProgress={xpProgress}
                      onClick={() => handleLessonSelect(lesson)}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Ordering Mode Indicator (Admin Only) */}
        {isAdmin && (
          <div className="p-3 border-t border-gray-200 bg-white text-xs text-gray-600 flex-shrink-0">
            Mode: <span className="font-semibold ml-1">{orderingMode === 'sequential' ? 'Sequential' : 'Free Choice'}</span>
          </div>
        )}
      </div>

      {/* Main Content - Lesson Viewer */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {/* Mobile Header Bar - Shows current lesson and toggle */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            aria-label="Open lessons menu"
          >
            <Bars3Icon className="w-5 h-5" />
          </button>
          {selectedLesson ? (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {selectedLesson.title}
              </div>
              <div className="text-xs text-gray-500">
                Lesson {lessons.findIndex(l => l.id === selectedLesson.id) + 1} of {lessons.length}
              </div>
            </div>
          ) : (
            <div className="flex-1 text-sm text-gray-500">Select a lesson</div>
          )}
          {/* Progress indicator */}
          {lessons.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
              <CheckCircleIcon className="w-4 h-4 text-green-500" />
              <span>{completedCount}/{lessons.length}</span>
            </div>
          )}
        </div>

        {/* Desktop toggle button (hidden on mobile since we have header bar) */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="hidden md:flex absolute top-4 left-4 z-10 p-2 bg-white rounded-lg shadow-lg border border-gray-200 hover:bg-gray-50"
            aria-label="Open lessons menu"
          >
            <Bars3Icon className="w-6 h-6 text-gray-700" />
          </button>
        )}

        {/* Lesson Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:p-6">
          {!selectedLesson ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500 px-4">
                <ClockIcon className="w-10 sm:w-12 h-10 sm:h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-base sm:text-lg font-medium">Select a lesson to view</p>
                <p className="text-sm mt-1">Choose from the menu</p>
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90"
                >
                  <Bars3Icon className="w-4 h-4" />
                  View Lessons
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {/* Lesson Header - Hero Treatment */}
              <div className="mb-6 sm:mb-8 pb-4 sm:pb-6 border-b border-gray-200">
                {/* Pillar Badge */}
                {selectedLesson.pillar && (
                  <div className="mb-2 sm:mb-3">
                    <span
                      className="inline-flex items-center px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs font-bold uppercase tracking-wider text-white shadow-sm"
                      style={{
                        backgroundColor: getPillarData(selectedLesson.pillar).color
                      }}
                    >
                      {getPillarData(selectedLesson.pillar).name}
                    </span>
                  </div>
                )}

                {/* Large Title - Responsive size */}
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 leading-tight">
                  {selectedLesson.title}
                </h1>

                {selectedLesson.description && (
                  <p className="text-base sm:text-lg text-gray-600 mb-3 sm:mb-4">{selectedLesson.description}</p>
                )}

                {/* Meta Bar with Icons */}
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-gray-600">
                  {selectedLesson.duration_minutes && (
                    <div className="flex items-center gap-1.5">
                      <ClockIcon className="w-4 h-4 text-gray-500" />
                      <span>{selectedLesson.duration_minutes} min</span>
                    </div>
                  )}
                  {selectedLesson.is_completed && (
                    <div className="flex items-center gap-1.5 text-green-600 font-medium">
                      <CheckCircleIcon className="w-4 h-4" />
                      <span>Completed</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Lesson Content */}
              <LessonContentRenderer content={selectedLesson.content} />

              {/* Linked Tasks Section */}
              {linkedTasks.length > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <ClipboardDocumentListIcon className="w-5 h-5 text-optio-purple" />
                      Related Tasks
                    </h3>
                    {onGenerateTasks && (
                      <button
                        onClick={() => onGenerateTasks(selectedLesson)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-optio-purple bg-optio-purple/10 rounded-lg hover:bg-optio-purple/20 transition-colors"
                      >
                        <SparklesIcon className="w-4 h-4" />
                        Generate More
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                    {linkedTasks.map((task) => {
                      const pillarData = getPillarData(task.pillar || 'wellness');
                      const isTaskCompleted = task.approval_status === 'approved' || task.is_completed;
                      return (
                        <button
                          key={task.id}
                          onClick={() => onTaskClick?.(task)}
                          className={`
                            p-3 rounded-lg border-2 text-left transition-all
                            hover:shadow-md hover:scale-[1.01] active:scale-[0.99]
                            ${isTaskCompleted ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-gray-300'}
                          `}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              {/* Task title */}
                              <p className="font-medium text-gray-900 text-sm line-clamp-2">
                                {task.title}
                              </p>
                              {/* Meta row */}
                              <div className="flex items-center gap-2 mt-1.5">
                                <span
                                  className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                                  style={{ backgroundColor: pillarData.color }}
                                >
                                  {pillarData.name}
                                </span>
                                {task.xp_value && (
                                  <span className="text-xs font-semibold text-optio-purple">
                                    {task.xp_value} XP
                                  </span>
                                )}
                              </div>
                            </div>
                            {isTaskCompleted ? (
                              <CheckCircleSolidIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                            ) : (
                              <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* XP Progress to unlock next lesson */}
                  {selectedLessonXPThreshold > 0 && (
                    <div className="mt-6 p-4 bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 rounded-xl border border-optio-purple/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">XP to unlock next lesson</span>
                        <span className={`text-sm font-bold ${selectedLessonEarnedXP >= selectedLessonXPThreshold ? 'text-green-600' : 'text-optio-purple'}`}>
                          {selectedLessonEarnedXP} / {selectedLessonXPThreshold} XP
                        </span>
                      </div>
                      <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            selectedLessonEarnedXP >= selectedLessonXPThreshold
                              ? 'bg-green-500'
                              : 'bg-gradient-to-r from-optio-purple to-optio-pink'
                          }`}
                          style={{ width: `${Math.min(100, (selectedLessonEarnedXP / selectedLessonXPThreshold) * 100)}%` }}
                        />
                      </div>
                      {selectedLessonEarnedXP >= selectedLessonXPThreshold && (
                        <p className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1">
                          <CheckCircleSolidIcon className="w-4 h-4" />
                          Next lesson unlocked!
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CurriculumView;
