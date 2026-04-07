import React from 'react'

const ORG_STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'org_review', label: 'Org Admin' },
  { key: 'optio_review', label: 'Optio' },
  { key: 'accreditor_review', label: 'Accreditor' },
  { key: 'approved', label: 'Approved' },
]

const PLATFORM_STEPS = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'advisor_review', label: 'Advisor' },
  { key: 'accreditor_review', label: 'Accreditor' },
  { key: 'approved', label: 'Approved' },
]

const getActiveStep = (diplomaStatus, accreditorStatus, isOrgStudent) => {
  if (isOrgStudent) {
    // Submitted(0) -> Org Admin(1) -> Optio(2) -> Accreditor(3) -> Approved(4)
    if (accreditorStatus === 'confirmed') return 4
    if (['flagged', 'overridden', 'pending_accreditor'].includes(accreditorStatus)) return 3
    if (diplomaStatus === 'approved') return 3
    if (diplomaStatus === 'pending_optio_approval') return 2
    if (diplomaStatus === 'pending_org_approval' || diplomaStatus === 'grow_this') return 1
    return 0
  }
  // Submitted(0) -> Advisor(1) -> Accreditor(2) -> Approved(3)
  if (accreditorStatus === 'confirmed') return 3
  if (['flagged', 'overridden', 'pending_accreditor'].includes(accreditorStatus)) return 2
  if (diplomaStatus === 'approved') return 2
  if (diplomaStatus === 'pending_review' || diplomaStatus === 'grow_this') return 1
  return 0
}

const StatusTimeline = ({ diplomaStatus, accreditorStatus, isOrgStudent = false }) => {
  const steps = isOrgStudent ? ORG_STEPS : PLATFORM_STEPS
  const activeStep = getActiveStep(diplomaStatus, accreditorStatus, isOrgStudent)
  const isFlagged = accreditorStatus === 'flagged'

  return (
    <div className="flex items-center gap-1 py-2">
      {steps.map((step, i) => (
        <React.Fragment key={step.key}>
          <div className="flex flex-col items-center">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium ${
              i < activeStep
                ? 'bg-green-500 text-white'
                : i === activeStep
                  ? isFlagged && step.key === 'accreditor_review'
                    ? 'bg-orange-500 text-white'
                    : 'bg-optio-purple text-white'
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
