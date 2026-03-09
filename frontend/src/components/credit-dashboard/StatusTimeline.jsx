import React from 'react'

const steps = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'advisor_review', label: 'Advisor' },
  { key: 'approved', label: 'Approved' },
  { key: 'accreditor_review', label: 'Accreditor' },
  { key: 'confirmed', label: 'Confirmed' },
]

const getActiveStep = (diplomaStatus, accreditorStatus) => {
  if (accreditorStatus === 'confirmed') return 4
  if (accreditorStatus === 'flagged' || accreditorStatus === 'overridden') return 3
  if (accreditorStatus === 'pending_accreditor') return 3
  if (diplomaStatus === 'approved') return 2
  if (diplomaStatus === 'pending_review') return 1
  if (diplomaStatus === 'grow_this') return 1
  return 0
}

const StatusTimeline = ({ diplomaStatus, accreditorStatus }) => {
  const activeStep = getActiveStep(diplomaStatus, accreditorStatus)
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
                  ? isFlagged && i >= 3
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
