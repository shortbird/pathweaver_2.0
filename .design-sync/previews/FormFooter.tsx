import { FormFooter } from 'optio-design-system';

export const Default = () => (
  <div style={{ width: 420 }}>
    <FormFooter submitText="Save changes" />
  </div>
);

export const SubmitVariants = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 420 }}>
    <FormFooter submitText="Save" submitVariant="primary" />
    <FormFooter submitText="Delete account" submitVariant="danger" cancelText="Keep" />
    <FormFooter submitText="Mark complete" submitVariant="success" />
  </div>
);

export const Submitting = () => (
  <div style={{ width: 420 }}>
    <FormFooter isSubmitting submitText="Save" />
  </div>
);

export const NoCancel = () => (
  <div style={{ width: 420 }}>
    <FormFooter showCancel={false} submitText="Continue" />
  </div>
);
