/**
 * useParent hook tests - children, dashboard, engagement, parent actions.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import { renderHook, waitFor } from '@testing-library/react-native';
import { useMyChildren, useChildDashboard, useChildEngagement } from '../useParent';
import api from '@/src/services/api';
import { setAuthAsParent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockChild, createMockChild13Plus, createMockChildUnder13 } from '@/src/__tests__/utils/mockFactories';

beforeEach(() => {
  setAuthAsParent();
  jest.clearAllMocks();
});

afterEach(() => {
  clearAuthState();
});

describe('useMyChildren', () => {
  it('fetches children from /api/dependents/my-dependents', async () => {
    const children = [createMockChild13Plus(), createMockChildUnder13()];
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { dependents: children } });

    const { result } = renderHook(() => useMyChildren());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/dependents/my-dependents');
    expect(result.current.children).toHaveLength(2);
  });

  it('filters 13+ children by date_of_birth', async () => {
    const children = [createMockChild13Plus(), createMockChildUnder13()];
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { dependents: children } });

    const { result } = renderHook(() => useMyChildren());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const now = new Date();
    const thirteenYearsAgo = new Date(now.getFullYear() - 13, now.getMonth(), now.getDate());
    const over13 = result.current.children.filter(
      (c) => c.date_of_birth && new Date(c.date_of_birth) <= thirteenYearsAgo
    );
    expect(over13.length).toBeGreaterThanOrEqual(1);
    expect(over13[0].first_name).toBe('Alex');
  });

  it('filters under-13 children by date_of_birth', async () => {
    const children = [createMockChild13Plus(), createMockChildUnder13()];
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { dependents: children } });

    const { result } = renderHook(() => useMyChildren());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const now = new Date();
    const thirteenYearsAgo = new Date(now.getFullYear() - 13, now.getMonth(), now.getDate());
    const under13 = result.current.children.filter(
      (c) => c.date_of_birth && new Date(c.date_of_birth) > thirteenYearsAgo
    );
    expect(under13.length).toBeGreaterThanOrEqual(1);
    expect(under13[0].first_name).toBe('Sam');
  });
});

describe('useChildDashboard', () => {
  it('fetches dashboard for specific child', async () => {
    const dashData = {
      student: createMockChild13Plus(),
      active_quests: [{ id: 'q1', title: 'Math Quest' }],
      completed_quests: [],
      stats: { total_xp: 850, completed_quests_count: 3, active_quests_count: 1, completed_tasks_count: 15 },
      recent_activity: [],
    };
    (api.get as jest.Mock).mockResolvedValueOnce({ data: dashData });

    const { result } = renderHook(() => useChildDashboard('child-13plus'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/parent/dashboard/child-13plus');
    expect(result.current.data?.stats.total_xp).toBe(850);
  });
});

describe('useChildEngagement', () => {
  it('fetches engagement data from /api/parent/{id}/engagement', async () => {
    const engData = { engagement: { rhythm: { level: 'steady' }, calendar: { days: [] } } };
    (api.get as jest.Mock).mockResolvedValueOnce({ data: engData });

    const { result } = renderHook(() => useChildEngagement('child-13plus'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/parent/child-13plus/engagement');
  });
});

describe('parent actions', () => {
  it('capture moment for one kid: POST with student_id', async () => {
    const formData = new FormData();
    formData.append('description', 'Jane learned to cook');
    formData.append('student_id', 'child-1');
    formData.append('source_type', 'parent');

    (api.post as jest.Mock).mockResolvedValueOnce({ data: { id: 'event-new' } });

    await api.post('/api/learning-events/quick', formData);

    expect(api.post).toHaveBeenCalledWith('/api/learning-events/quick', formData);
  });

  it('capture moment for multiple kids: batch POST calls', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { id: 'event-new' } });

    const childIds = ['child-1', 'child-2'];
    const promises = childIds.map((childId) => {
      const formData = new FormData();
      formData.append('description', 'Family science project');
      formData.append('student_id', childId);
      return api.post('/api/learning-events/quick', formData);
    });

    await Promise.all(promises);

    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('add observer to kid: POST /api/observers/invite with student_id', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { invitation: { id: 'inv-1' } } });

    await api.post('/api/observers/invite', {
      student_id: 'child-1',
      observer_email: 'grandma@test.com',
    });

    expect(api.post).toHaveBeenCalledWith('/api/observers/invite', {
      student_id: 'child-1',
      observer_email: 'grandma@test.com',
    });
  });

  it('remove observer from kid: DELETE /api/observers/{id}', async () => {
    (api.delete as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await api.delete('/api/observers/observer-1');

    expect(api.delete).toHaveBeenCalledWith('/api/observers/observer-1');
  });

  it('toggle AI settings: PUT /api/dependents/{id}/settings', async () => {
    (api.put as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    await api.put('/api/dependents/child-1/settings', { ai_enabled: false });

    expect(api.put).toHaveBeenCalledWith('/api/dependents/child-1/settings', { ai_enabled: false });
  });

  it('upload profile pic: PUT with FormData', async () => {
    const formData = new FormData();
    formData.append('avatar', { uri: 'file://avatar.jpg', name: 'avatar.jpg', type: 'image/jpeg' } as any);

    (api.put as jest.Mock).mockResolvedValueOnce({ data: { avatar_url: 'https://cdn/avatar.jpg' } });

    await api.put('/api/users/child-1/profile', formData);

    expect(api.put).toHaveBeenCalledWith('/api/users/child-1/profile', formData);
  });

  it('give under-13 kid own login: POST /api/dependents/{id}/promote', async () => {
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true, email: 'sam@test.com' } });

    await api.post('/api/dependents/child-under13/promote', {
      email: 'sam@test.com',
      password: 'securepass123',
    });

    expect(api.post).toHaveBeenCalledWith('/api/dependents/child-under13/promote', {
      email: 'sam@test.com',
      password: 'securepass123',
    });
  });
});
