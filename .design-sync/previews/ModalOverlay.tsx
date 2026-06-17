import { ModalOverlay, Card, CardTitle, Button } from 'optio-design-system';

export const Centered = () => (
  <ModalOverlay
    onClose={() => {}}
    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
  >
    <div style={{ width: 360 }}>
      <Card variant="elevated">
        <CardTitle size="md">Custom modal layout</CardTitle>
        <p style={{ color: '#4b5563', fontSize: 14, marginTop: 8, marginBottom: 16, lineHeight: 1.5 }}>
          ModalOverlay portals any custom content to document.body, so fixed positioning works
          even inside transformed containers.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="sm">Got it</Button>
        </div>
      </Card>
    </div>
  </ModalOverlay>
);
