/**
 * useLessonNavigation Hook
 *
 * Manages step-by-step navigation within a lesson.
 * Handles keyboard navigation and step transitions.
 *
 * Usage:
 *   const {
 *     currentStepIndex,
 *     setCurrentStepIndex,
 *     goToNextStep,
 *     goToPrevStep,
 *     goToStep,
 *     canGoNext,
 *     canGoPrev,
 *     isOnContentStep,
 *     isOnFinishedStep,
 *     isOnTasksStep
 *   } = useLessonNavigation({
 *     totalContentSteps: 5,
 *     hasTasksStep: true,
 *     onStepChange: (index) => {},
 *     onStepComplete: (index) => {},
 *     enableKeyboardNav: true
 *   });
 */

import { useState, useCallback, useEffect } from 'react';

export function useLessonNavigation({
  totalContentSteps = 0,
  hasTasksStep = false,
  onStepChange,
  onStepComplete,
  enableKeyboardNav = true,
  initialStep = 0
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStep);

  // Calculate total steps including virtual steps (finished step + tasks step)
  // When there are tasks: content steps + finished step + tasks step = totalSteps + 2
  const totalStepsWithTasks = hasTasksStep ? totalContentSteps + 2 : totalContentSteps;

  // Determine what type of step we're on
  const isOnContentStep = currentStepIndex < totalContentSteps;
  const isOnFinishedStep = hasTasksStep && currentStepIndex === totalContentSteps;
  const isOnTasksStep = hasTasksStep && currentStepIndex === totalContentSteps + 1;

  // Navigation state
  const canGoNext = currentStepIndex < totalStepsWithTasks - 1;
  const canGoPrev = currentStepIndex > 0;

  // Navigate to next step
  const goToNextStep = useCallback(() => {
    if (!canGoNext) return false;

    const newIndex = currentStepIndex + 1;

    // Mark current step as completed when advancing
    if (isOnContentStep) {
      onStepComplete?.(currentStepIndex);
    }

    setCurrentStepIndex(newIndex);
    onStepChange?.(newIndex);
    return true;
  }, [currentStepIndex, canGoNext, isOnContentStep, onStepChange, onStepComplete]);

  // Navigate to previous step
  const goToPrevStep = useCallback(() => {
    if (!canGoPrev) return false;

    const newIndex = currentStepIndex - 1;
    setCurrentStepIndex(newIndex);
    onStepChange?.(newIndex);
    return true;
  }, [currentStepIndex, canGoPrev, onStepChange]);

  // Jump to a specific step
  const goToStep = useCallback((index) => {
    if (index < 0 || index >= totalStepsWithTasks) return false;

    setCurrentStepIndex(index);
    onStepChange?.(index);
    return true;
  }, [totalStepsWithTasks, onStepChange]);

  // Reset to first step
  const resetNavigation = useCallback(() => {
    setCurrentStepIndex(0);
    onStepChange?.(0);
  }, [onStepChange]);

  // Go to tasks step (shortcut)
  const goToTasksStep = useCallback(() => {
    if (!hasTasksStep) return false;
    const tasksIndex = totalContentSteps + 1;
    setCurrentStepIndex(tasksIndex);
    onStepChange?.(tasksIndex);
    return true;
  }, [hasTasksStep, totalContentSteps, onStepChange]);

  // Go to finished step (shortcut)
  const goToFinishedStep = useCallback(() => {
    if (!hasTasksStep) return false;
    const finishedIndex = totalContentSteps;
    setCurrentStepIndex(finishedIndex);
    onStepChange?.(finishedIndex);
    return true;
  }, [hasTasksStep, totalContentSteps, onStepChange]);

  // Keyboard navigation
  useEffect(() => {
    if (!enableKeyboardNav) return;

    const handleKeyDown = (e) => {
      // Don't handle if in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToNextStep();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPrevStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardNav, goToNextStep, goToPrevStep]);

  // Get progress info
  const getProgressInfo = useCallback(() => {
    if (isOnTasksStep) {
      return { label: 'Practice', type: 'tasks' };
    }
    if (isOnFinishedStep) {
      return { label: 'Complete', type: 'finished' };
    }
    return {
      label: `Step ${currentStepIndex + 1} of ${totalContentSteps}`,
      type: 'content',
      current: currentStepIndex + 1,
      total: totalContentSteps
    };
  }, [currentStepIndex, totalContentSteps, isOnContentStep, isOnFinishedStep, isOnTasksStep]);

  return {
    currentStepIndex,
    setCurrentStepIndex,
    goToNextStep,
    goToPrevStep,
    goToStep,
    goToTasksStep,
    goToFinishedStep,
    resetNavigation,
    canGoNext,
    canGoPrev,
    isOnContentStep,
    isOnFinishedStep,
    isOnTasksStep,
    totalStepsWithTasks,
    getProgressInfo
  };
}

export default useLessonNavigation;
