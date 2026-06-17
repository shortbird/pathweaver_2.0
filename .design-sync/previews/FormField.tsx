import { FormField } from 'optio-design-system';

export const Text = () => (
  <div style={{ width: 380 }}>
    <FormField
      label="Display name"
      required
      helperText="This is how your name appears on your portfolio."
      inputProps={{ defaultValue: 'Ada Lovelace' }}
    />
  </div>
);

export const WithError = () => (
  <div style={{ width: 380 }}>
    <FormField
      label="Email"
      type="email"
      required
      errorMessage="That email is already in use."
      inputProps={{ defaultValue: 'ada@example.com' }}
    />
  </div>
);

export const Textarea = () => (
  <div style={{ width: 380 }}>
    <FormField
      label="Reflection"
      type="textarea"
      helperText="A few sentences about what you learned."
      inputProps={{ rows: 3, placeholder: 'What did you discover?' }}
    />
  </div>
);

export const Select = () => (
  <div style={{ width: 380 }}>
    <FormField
      label="Primary pillar"
      type="select"
      inputProps={{
        options: [
          { value: 'stem', label: 'STEM' },
          { value: 'art', label: 'Art' },
          { value: 'civics', label: 'Civics' },
        ],
        defaultValue: 'art',
      }}
    />
  </div>
);
