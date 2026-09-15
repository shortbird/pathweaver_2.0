/**
 * The preview role is a choice, never a default. A superadmin who has not
 * picked one opens the app as themselves -- with children, that is the
 * Family tab, and it lists them (2026-09-15).
 */

import { usePreviewRoleStore } from '../previewRoleStore';

beforeEach(() => {
  usePreviewRoleStore.setState({ previewRole: null });
  try { localStorage.removeItem('optio_preview_role'); } catch { /* native */ }
});

describe('previewRoleStore.restore', () => {
  it('leaves a superadmin with no stored choice in their own shell', () => {
    usePreviewRoleStore.getState().restore();
    expect(usePreviewRoleStore.getState().previewRole).toBeNull();
  });

  it('keeps an explicit choice for the session', () => {
    usePreviewRoleStore.getState().setPreviewRole('observer');
    expect(usePreviewRoleStore.getState().previewRole).toBe('observer');
    usePreviewRoleStore.getState().setPreviewRole(null);
    usePreviewRoleStore.getState().restore();
    expect(usePreviewRoleStore.getState().previewRole).toBeNull();
  });
});
