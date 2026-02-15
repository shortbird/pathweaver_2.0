/**
 * Course Builder Hooks Module
 *
 * Provides state management for the Course Builder page.
 * Split into focused hooks for better maintainability:
 *
 * - useModalState: Modal visibility management (15 modals!)
 * - useSelectionState: Selection and outline navigation
 * - useAITools: AI generation tools
 *
 * The main useCourseBuilderState hook composes these together
 * while maintaining the original API for backward compatibility.
 */

export { useModalState } from './useModalState'
export { useSelectionState } from './useSelectionState'
export { useAITools } from './useAITools'

// Re-export the composed hook as the default
export { useCourseBuilderState as default } from '../useCourseBuilderState'
