import { useBugReportStore } from '../bugReportStore';

describe('bugReportStore', () => {
  beforeEach(() => {
    useBugReportStore.setState({ visible: false, screenshotUri: null });
  });

  it('opens with a screenshot uri', () => {
    useBugReportStore.getState().open({ screenshotUri: 'file:///s.jpg' });
    const s = useBugReportStore.getState();
    expect(s.visible).toBe(true);
    expect(s.screenshotUri).toBe('file:///s.jpg');
  });

  it('opens without a screenshot (Profile entry point)', () => {
    useBugReportStore.getState().open();
    const s = useBugReportStore.getState();
    expect(s.visible).toBe(true);
    expect(s.screenshotUri).toBeNull();
  });

  it('close clears visibility and screenshot', () => {
    useBugReportStore.getState().open({ screenshotUri: 'file:///s.jpg' });
    useBugReportStore.getState().close();
    const s = useBugReportStore.getState();
    expect(s.visible).toBe(false);
    expect(s.screenshotUri).toBeNull();
  });
});
