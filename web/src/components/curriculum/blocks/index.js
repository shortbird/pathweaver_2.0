/**
 * Block Registry - Central configuration for all curriculum block types
 */
import {
  DocumentTextIcon,
  PhotoIcon,
  VideoCameraIcon,
  PaperClipIcon,
  InformationCircleIcon,
  MinusIcon,
} from '@heroicons/react/24/outline'

// Block Editor Components
export { default as CalloutBlockEditor } from './CalloutBlockEditor'
export { default as DividerBlockEditor } from './DividerBlockEditor'

// Block type configurations
export const BLOCK_TYPES = {
  text: {
    type: 'text',
    label: 'Text',
    description: 'Rich text with formatting',
    icon: DocumentTextIcon,
  },
  image: {
    type: 'image',
    label: 'Image',
    description: 'Upload or embed an image',
    icon: PhotoIcon,
  },
  iframe: {
    type: 'iframe',
    label: 'Video',
    description: 'YouTube, Vimeo, Loom, etc.',
    icon: VideoCameraIcon,
  },
  document: {
    type: 'document',
    label: 'Document',
    description: 'Link to a file',
    icon: PaperClipIcon,
  },
  callout: {
    type: 'callout',
    label: 'Callout',
    description: 'Info, tip, or warning box',
    icon: InformationCircleIcon,
  },
  divider: {
    type: 'divider',
    label: 'Divider',
    description: 'Visual separator',
    icon: MinusIcon,
  },
}

// Callout variants with their styles
export const CALLOUT_VARIANTS = {
  info: {
    name: 'Info',
    bg: 'bg-blue-50',
    borderColor: '#bfdbfe', // blue-200
    iconColor: 'text-blue-600',
    titleColor: 'text-blue-900',
  },
  tip: {
    name: 'Tip',
    bg: 'bg-green-50',
    borderColor: '#bbf7d0', // green-200
    iconColor: 'text-green-600',
    titleColor: 'text-green-900',
  },
  warning: {
    name: 'Warning',
    bg: 'bg-amber-50',
    borderColor: '#fde68a', // amber-200
    iconColor: 'text-amber-600',
    titleColor: 'text-amber-900',
  },
  important: {
    name: 'Important',
    bg: 'bg-gradient-to-r from-optio-purple/5 to-optio-pink/5',
    borderColor: '#6D469B', // optio-purple
    iconColor: 'text-optio-purple',
    titleColor: 'text-optio-purple',
  },
}

// Divider styles
export const DIVIDER_STYLES = {
  line: { name: 'Line', className: 'border-t border-gray-300' },
  dots: { name: 'Dots', className: 'dots-divider' },
  gradient: { name: 'Gradient', className: 'gradient-divider' },
}

// Create a new block with default values
export const createBlock = (type) => {
  const baseBlock = {
    id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    content: '',
    data: {},
  }

  // Type-specific defaults
  switch (type) {
    case 'text':
      return { ...baseBlock, data: { format: 'html' } }
    case 'image':
      return { ...baseBlock, data: { alignment: 'center', alt: '', caption: '' } }
    case 'callout':
      return { ...baseBlock, data: { variant: 'info' } }
    case 'divider':
      return { ...baseBlock, data: { style: 'line' } }
    default:
      return baseBlock
  }
}

// Get block type config
export const getBlockConfig = (type) => BLOCK_TYPES[type] || BLOCK_TYPES.text

// Available block types for the add menu (in display order)
export const BLOCK_TYPE_LIST = ['text', 'image', 'iframe', 'callout', 'divider', 'document']
