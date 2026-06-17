import { Button } from 'optio-design-system';

const row = { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } as const;

export const Variants = () => (
  <div style={row}>
    <Button variant="primary">Start Quest</Button>
    <Button variant="secondary">Save Draft</Button>
    <Button variant="outline">Preview</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="danger">Delete</Button>
    <Button variant="success">Complete</Button>
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Button size="xs">Extra small</Button>
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
    <Button size="lg">Large</Button>
    <Button size="xl">Extra large</Button>
  </div>
);

export const States = () => (
  <div style={row}>
    <Button>Default</Button>
    <Button loading>Saving</Button>
    <Button disabled>Disabled</Button>
  </div>
);
