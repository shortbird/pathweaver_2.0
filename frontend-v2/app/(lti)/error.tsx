/**
 * Generic error UX inside the iframe. We never link out — the parent is
 * Canvas and clicking "go to optio.com" inside an iframe is a worse UX
 * than just telling the teacher/student to relaunch from Canvas.
 *
 * Rendered inside LtiShell so it reports its height to Canvas and stays
 * width-constrained like every other LTI page.
 */

import { useLocalSearchParams } from 'expo-router';
import { LtiShell } from '@/src/components/lti/LtiShell';

const MESSAGES: Record<string, string> = {
  no_target:
    'No Optio quest is associated with this Canvas item yet. The teacher needs to add one via "+ External Tool" → Optio.',
  expired:
    'This launch session has expired. Reload the page in Canvas to start over.',
  default:
    'Something went wrong with this launch. Reload the page in Canvas to try again.',
};

export default function LtiError() {
  const params = useLocalSearchParams<{ reason?: string }>();
  const message = MESSAGES[params.reason || 'default'] || MESSAGES.default;

  return <LtiShell error={message} />;
}
