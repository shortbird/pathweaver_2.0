/**
 * CourseOnboardingSteps
 *
 * Defines the walkthrough sequence and renders the appropriate CoachMark.
 * Steps 0-2: Centered orientation cards explaining the Optio model
 * Steps 3-4: Coach marks pointing at projects and tasks
 * Steps 5-6: Centered cards explaining task flow and completion
 * Step 7: Coach mark on course progress
 */

import { useOnboarding } from '../../contexts/OnboardingContext'
import CoachMark from './CoachMark'

const STEPS = [
  {
    // Step 0: Centered card
    targetSelector: null,
    title: 'Why This Feels Different',
    content:
      'Optio courses are not lecture-and-test. You learn by doing -- complete tasks you choose to earn XP and finish projects.',
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
    // Step 3: Coach mark on first quest item
    targetSelector: '[data-onboarding="quest-item-0"]',
    title: 'These Are Your Projects',
    content:
      'Your course is made up of projects. Click one to see its tasks, suggested activities, and lessons.',
  },
  {
    // Step 4: Coach mark on the tasks section (auto-selects first project)
    targetSelector: '[data-onboarding="project-tasks"]',
    title: 'Tasks Earn XP',
    content:
      'This is where the action happens. Add tasks, attach evidence of your work, and mark them complete to earn XP.',
  },
  {
    // Step 5: Centered card explaining the flow
    targetSelector: null,
    title: 'How Tasks Work',
    content:
      'Pick from suggested tasks, use AI to create personalized ones, or write your own. Attach evidence (photos, text, files) and complete them to earn XP.',
  },
  {
    // Step 6: Centered card explaining completion
    targetSelector: null,
    title: 'Completing the Course',
    content:
      'Each project has a minimum XP requirement. Complete tasks to meet that goal for every project, and you will complete the course.',
  },
  {
    // Step 7: Coach mark on course progress
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
