import React from 'react'

const ORG_STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'org_review', label: 'Org Admin' },
  { key: 'optio_review', label: 'Optio' },
  { key: 'approved', label: 'Approved' },
]

const PLATFORM_STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'review', label: 'Review' },
  { key: 'approved', label: 'Approved' },
]

// `orgReviewerId` is set on the completion the moment an org admin
// approves. We use that flag to tell apart "in org admin queue" from
// "org admin approved -> now in Optio queue" — both share
// diploma_status='pending_review' for org students but represent
// different stages in the UI.
const getActiveStep = (diplomaStatus, isOrgStudent, orgReviewerId) => {
  if (isOrgStudent) {
    // Submitted(0) -> Org Admin(1) -> Optio(2) -> Approved(3)
    if (diplomaStatus === 'finalized') return 3
    if (diplomaStatus === 'pending_review') return orgReviewerId ? 2 : 1
    if (diplomaStatus === 'pending_org_approval' || diplomaStatus === 'grow_this') return 1
    return 0
  }
  // Submitted(0) -> Review(1) -> Approved(2)
  if (diplomaStatus === 'finalized') return 2
  if (diplomaStatus === 'pending_review' || diplomaStatus === 'grow_this') return 1
  return 0
}

const StatusTimeline = ({ diplomaStatus, isOrgStudent = false, orgReviewerId = null }) => {
  const steps = isOrgStudent ? ORG_STEPS : PLATFORM_STEPS
  const activeStep = getActiveStep(diplomaStatus, isOrgStudent, orgReviewerId)

  return (
    <div className="flex items-center gap-1 py-2">
      {steps.map((step, i) => (
        <React.Fragment key={step.key}>
          <div className="flex flex-col items-center">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium ${
              i < activeStep
                ? 'bg-green-500 text-white'
                : i === activeStep
                  ? 'bg-optio-purple text-white'
                  : 'bg-gray-200 text-gray-400'
            }`}>
              {i < activeStep ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className="text-[9px] text-gray-500 mt-0.5 whitespace-nowrap">{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mt-[-10px] ${
              i < activeStep ? 'bg-green-500' : 'bg-gray-200'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export default StatusTimeline
