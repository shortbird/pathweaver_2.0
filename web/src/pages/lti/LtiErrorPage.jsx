/**
 * Generic error UX inside the iframe (v1). We never link out — the parent
 * is Canvas and clicking "go to optio.com" inside an iframe is a worse UX
 * than just telling the teacher/student to relaunch from Canvas.
 */

import { useSearchParams } from 'react-router-dom'
import LtiShell from '../../components/lti/LtiShell'

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
  return <LtiShell error={message} />
}
