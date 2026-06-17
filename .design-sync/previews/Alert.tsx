import { Alert } from 'optio-design-system';

const stack = { display: 'flex', flexDirection: 'column', gap: 12, width: 480 } as const;

export const Variants = () => (
  <div style={stack}>
    <Alert variant="info" title="Heads up">
      Your next lesson unlocks once you complete this task.
    </Alert>
    <Alert variant="success" title="Task approved">
      Nice work — you earned 50 XP toward the Personal Finance class.
    </Alert>
    <Alert variant="warning" title="Almost there">
      You have 2 tasks left before this quest counts toward credit.
    </Alert>
    <Alert variant="error" title="Submission failed">
      We couldn&apos;t upload your evidence. Check your connection and try again.
    </Alert>
    <Alert variant="purple" title="The process is the goal">
      Learning happens while you do the work, not after.
    </Alert>
  </div>
);

export const WithoutTitle = () => (
  <div style={{ width: 480 }}>
    <Alert variant="info">A short, single-line notice without a title.</Alert>
  </div>
);

export const WithoutIcon = () => (
  <div style={{ width: 480 }}>
    <Alert variant="success" title="Saved" showIcon={false}>
      The icon is hidden with showIcon=false for a tighter, text-only notice.
    </Alert>
  </div>
);
