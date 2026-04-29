/**
 * Generic error UX inside the iframe (v1). We never link out — the parent
 * is Canvas and clicking "go to optio.com" inside an iframe is a worse UX
 * than just telling the teacher/student to relaunch from Canvas.
 */

import { useSearchParams } from 'react-router-dom'

const MESSAGES = {
  no_target:
    'No Optio quest is associated with this Canvas item yet. The teacher needs to add one via "+ External Tool" → Optio.',
  expired: 'This launch session has expired. Reload the page in Canvas to start over.',
  default: 'Something went wrong with this launch. Reload the page in Canvas to try again.',
}

export default function LtiErrorPage() {
  const [searchParams] = useSearchParams()
  const reason = searchParams.get('reason') || 'default'
  const message = MESSAGES[reason] || MESSAGES.default

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-gray-900">
          We can't load this Optio assignment
        </h1>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
      </div>
    </div>
  )
}
