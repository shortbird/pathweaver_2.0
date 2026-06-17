import { Input } from 'optio-design-system';

const stack = { display: 'flex', flexDirection: 'column', gap: 12, width: 360 } as const;

export const Default = () => (
  <div style={stack}>
    <Input placeholder="you@example.com" />
    <Input defaultValue="Ada Lovelace" />
  </div>
);

export const Error = () => (
  <div style={{ width: 360 }}>
    <Input error errorMessage="Please enter a valid email address." defaultValue="not-an-email" />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 360 }}>
    <Input disabled defaultValue="Read only" />
  </div>
);
