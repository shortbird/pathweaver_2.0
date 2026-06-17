import { Textarea } from 'optio-design-system';

export const Default = () => (
  <div style={{ width: 420 }}>
    <Textarea
      rows={4}
      defaultValue={'I documented my project by photographing my notebook and writing a short reflection on what I learned.'}
    />
  </div>
);

export const Placeholder = () => (
  <div style={{ width: 420 }}>
    <Textarea rows={3} placeholder="Describe what you did and what you learned..." />
  </div>
);

export const Error = () => (
  <div style={{ width: 420 }}>
    <Textarea error errorMessage="Reflection is required before submitting." rows={3} />
  </div>
);
