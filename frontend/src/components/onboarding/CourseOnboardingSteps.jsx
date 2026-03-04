/**
 * CourseOnboardingSteps
 *
 * Defines the 8-step walkthrough sequence and renders the appropriate CoachMark.
 * Steps 0-2: Centered orientation cards explaining the Optio model
 * Steps 3-7: Coach marks pointing at real UI elements
 */

import { useOnboarding } from '../../contexts/OnboardingContext'
import CoachMark from './CoachMark'

const STEPS = [
  {
    // Step 0: Centered card
    targetSelector: null,
    title: 'Why This Feels Different',
    content:
      'Optio courses are not lecture-and-test. You learn by doing. Lessons give you just enough to start, then you apply what you learned through tasks you choose.',
  },
  {
    // Step 1: Centered card
    targetSelector: null,
    title: 'Your Learning, Your Way',
    content:
      'Choose tasks that interest you or create your own. The goal is building real skills through projects you care about.',
  },
  {
    // Step 2: Centered card
    targetSelector: null,
    title: 'XP Is Your Progress',
    content:
      'Every task earns XP. Meet the XP goal for each project to complete the course. No grades, just evidence of growth.',
  },
  {
    // Step 3: Coach mark on first quest item (collapsed)
    targetSelector: '[data-onboarding="quest-item-0"]',
    title: 'These Are Your Projects',
    content:
      'Your course is made up of projects. Each one has lessons and tasks to complete.',
  },
  {
    // Step 4: Coach mark on first lesson item (quest auto-expands on this step)
    targetSelector: '[data-onboarding="lesson-item-0"]',
    title: 'Start With a Lesson',
    content:
      'Lessons give you just enough context to get started on your tasks.',
  },
  {
    // Step 5: Coach mark on step indicators
    targetSelector: '[data-onboarding="step-indicators"]',
    title: 'Navigate Through Steps',
    content:
      'Each lesson has steps. Use arrows or dots to move through them.',
  },
  {
    // Step 6: Coach mark on tasks step (lesson navigates here automatically)
    targetSelector: '[data-onboarding="tasks-step"]',
    title: 'Apply What You Learned',
    content:
      'After each lesson, you will find tasks. Pick suggested tasks or create your own to earn XP toward your project goal.',
  },
  {
    // Step 7: Centered card explaining XP requirements
    targetSelector: null,
    title: 'Completing the Course',
    content:
      'Each project has a minimum XP requirement. Complete tasks to meet that goal for every project, and you will complete the course.',
  },
  {
    // Step 8: Coach mark on course progress
    targetSelector: '[data-onboarding="course-progress"]',
    title: 'Track Your Journey',
    content:
      'Your progress is always visible here. You\'re ready to go!',
  },
]

const CourseOnboardingSteps = () => {
  const { isActive, currentStep, totalSteps, nextStep, prevStep, skipOnboarding } =
    useOnboarding()

  if (!isActive || currentStep >= STEPS.length) return null

  const step = STEPS[currentStep]

  return (
    <CoachMark
      targetSelector={step.targetSelector}
      title={step.title}
      content={step.content}
      stepNumber={currentStep}
      totalSteps={totalSteps}
      onNext={nextStep}
      onPrev={prevStep}
      onSkip={skipOnboarding}
      isActive={isActive}
    />
  )
}

export default CourseOnboardingSteps
