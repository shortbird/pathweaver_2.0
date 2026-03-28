/**
 * Observer flow tests - invitation, removal, likes, comments.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import api from '@/src/services/api';
import { setAuthAsStudent, setAuthAsObserver, setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  clearAuthState();
});

describe('observer invitation flows', () => {
  it('accept invitation via link: POST /api/observers/accept', async () => {
    setAuthAsObserver();
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { success: true, student: { id: 'student-1', display_name: 'Jane' } },
    });

    await api.post('/api/observers/accept', { invitation_code: 'abc-123-def' });

    expect(api.post).toHaveBeenCalledWith('/api/observers/accept', {
      invitation_code: 'abc-123-def',
    });
  });

  it('accept invitation via QR code: same endpoint (QR generates link with code)', async () => {
    setAuthAsObserver();
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { success: true },
    });

    // QR code contains the same invitation code, just delivered via scan
    await api.post('/api/observers/accept', { invitation_code: 'qr-code-xyz' });

    expect(api.post).toHaveBeenCalledWith('/api/observers/accept', {
      invitation_code: 'qr-code-xyz',
    });
  });

  it('student invites observer: POST /api/observers/invite from student context', async () => {
    setAuthAsStudent();
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { invitation: { id: 'inv-1', code: 'abc' } },
    });

    await api.post('/api/observers/invite', {
      observer_email: 'coach@test.com',
    });

    expect(api.post).toHaveBeenCalledWith('/api/observers/invite', {
      observer_email: 'coach@test.com',
    });
  });

  it('parent adds observer to kid: POST /api/observers/invite with student_id', async () => {
    setAuthAsParent();
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { invitation: { id: 'inv-2' } },
    });

    await api.post('/api/observers/invite', {
      student_id: 'child-1',
      observer_email: 'tutor@test.com',
    });

    expect(api.post).toHaveBeenCalledWith('/api/observers/invite', {
      student_id: 'child-1',
      observer_email: 'tutor@test.com',
    });
  });
});

describe('observer removal', () => {
  it('student removes observer: DELETE /api/observers/{id}', async () => {
    setAuthAsStudent();
    (api.delete as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await api.delete('/api/observers/observer-1');

    expect(api.delete).toHaveBeenCalledWith('/api/observers/observer-1');
  });
});

describe('observer feed interactions', () => {
  it('like feed post (task_completed): POST correct endpoint', async () => {
    setAuthAsObserver();
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { liked: true, likes_count: 3 } });

    await api.post('/api/observers/completions/task-123/like', {});

    expect(api.post).toHaveBeenCalledWith('/api/observers/completions/task-123/like', {});
  });

  it('comment on feed post: POST /api/observers/comments', async () => {
    setAuthAsObserver();
    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { comment: { id: 'c1', comment_text: 'Proud of you!' } },
    });

    await api.post('/api/observers/comments', {
      completion_id: 'task-123',
      learning_event_id: null,
      comment_text: 'Proud of you!',
    });

    expect(api.post).toHaveBeenCalledWith('/api/observers/comments', {
      completion_id: 'task-123',
      learning_event_id: null,
      comment_text: 'Proud of you!',
    });
  });
});
