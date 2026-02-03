import React from 'react'
import {
  InformationCircleIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { CALLOUT_VARIANTS } from './index'

const VARIANT_ICONS = {
  info: InformationCircleIcon,
  tip: LightBulbIcon,
  warning: ExclamationTriangleIcon,
  important: SparklesIcon,
}

const CalloutBlockEditor = ({ block, onUpdate }) => {
  const variant = block.data?.variant || 'info'
  const variantConfig = CALLOUT_VARIANTS[variant]
  const Icon = VARIANT_ICONS[variant]

  const handleVariantChange = (newVariant) => {
    onUpdate(block.id, {
      data: { ...block.data, variant: newVariant },
    })
  }

  const handleContentChange = (e) => {
    onUpdate(block.id, { content: e.target.value })
  }

  return (
    <div className="space-y-3">
      {/* Variant Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Callout Type
        </label>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(CALLOUT_VARIANTS).map(([key, config]) => {
            const VariantIcon = VARIANT_ICONS[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleVariantChange(key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                  variant === key
                    ? 'border-optio-purple bg-optio-purple/5 font-medium'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <VariantIcon className={`w-4 h-4 ${variant === key ? 'text-optio-purple' : 'text-gray-500'}`} />
                <span className="text-sm">{config.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content Editor with Preview */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Content
        </label>
        <textarea
          value={block.content || ''}
          onChange={handleContentChange}
          placeholder="Enter callout text..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
        />
      </div>

      {/* Live Preview */}
      {block.content && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Preview
          </label>
          <div
            className={`flex gap-3 p-4 rounded-lg border-l-4 ${variantConfig.bg}`}
            style={{ borderLeftColor: variantConfig.borderColor }}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${variantConfig.iconColor}`} />
            <div className={`flex-1 text-sm ${variantConfig.titleColor}`}>
              {block.content}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CalloutBlockEditor
