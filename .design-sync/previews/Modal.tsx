import { Modal, Button } from 'optio-design-system';

export const Default = () => (
  <Modal
    isOpen
    onClose={() => {}}
    title="Submit your evidence"
    size="md"
    footer={
      <>
        <Button variant="ghost" size="sm">Cancel</Button>
        <Button size="sm">Submit for review</Button>
      </>
    }
  >
    <p style={{ color: '#4b5563', fontSize: 14, lineHeight: 1.6 }}>
      Upload a photo, paste a link, or type a short reflection describing what you did.
      Your advisor reviews it before it counts toward credit.
    </p>
  </Modal>
);
