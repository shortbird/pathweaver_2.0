/**
 * Extracted from admin/CourseGeneratorWizard.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import React, { useState, useEffect, useCallback } from 'react'

const WizardProgress = ({ currentStage, stages }) => {
  return (
    <div className="flex items-center justify-center mb-8">
      {stages.map((stage, index) => {
        const isActive = index + 1 === currentStage
        const isComplete = index + 1 < currentStage

        return (
          <React.Fragment key={stage.id}>
            {index > 0 && (
              <div
                className={`h-0.5 w-16 mx-2 ${
                  isComplete ? 'bg-optio-purple' : 'bg-gray-200'
                }`}
              />
            )}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-medium text-sm ${
                  isActive
                    ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                    : isComplete
                    ? 'bg-optio-purple text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {isComplete ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <span className={`text-xs mt-1 ${isActive ? 'text-optio-purple font-medium' : 'text-gray-500'}`}>
                {stage.label}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// =============================================================================
// STAGE 1: OUTLINE COMPONENT
// =============================================================================

export default WizardProgress
