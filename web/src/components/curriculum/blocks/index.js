/**
 * Block Registry - Central configuration for all curriculum block types
 *
 * A barrel, and only a barrel. The constants live in ./blockConfig so that the
 * editor components can read them without importing this file, which imports
 * them -- see the header there for what that cycle cost.
 */

// Block Editor Components
export { default as CalloutBlockEditor } from './CalloutBlockEditor'
export { default as DividerBlockEditor } from './DividerBlockEditor'

// Block type configurations, re-exported so existing importers
// (LessonBlockEditor, LessonContentRenderer) keep working unchanged.
export {
  BLOCK_TYPES,
  CALLOUT_VARIANTS,
  DIVIDER_STYLES,
  createBlock,
  getBlockConfig,
  BLOCK_TYPE_LIST,
} from './blockConfig'
