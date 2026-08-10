/**
 * School hooks — the gate (useSchool), the hub data (useSchoolHub), the
 * message archive pager (useSchoolArchive), and absences (useSchoolAbsences).
 */

jest.mock('@/src/services/api', () => require('@/src/__tests__/utils/mockApi').mockApiModule());

import { renderHook, act, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import {
  useSchool,
  useSchoolHub,
  useSchoolArchive,
  useSchoolAbsences,
  __resetSchoolPreviewCache,
} from '../useSchool';

const setUser = (user: any) => {
  act(() => {
    useAuthStore.setState({ user, isAuthenticated: !!user, isLoading: false });
  });
};

afterEach(() => {
  setUser(null);
  jest.clearAllMocks();
  __resetSchoolPreviewCache();
});

describe('useSchool', () => {
  it('returns null when the user has no school', () => {
    setUser({ id: 'u1', role: 'student' });
    expect(renderHook(() => useSchool()).result.current).toBeNull();
  });

  it('returns the school when the org has opted in (school_homepage flag)', () => {
    setUser({ id: 'u1', role: 'parent', school: { id: 'org-1', name: 'iCreate', homepage: true } });
    expect(renderHook(() => useSchool()).result.current)
      .toEqual({ id: 'org-1', name: 'iCreate', homepage: true });
  });

  it('returns null when the org has not opted in — the surface is per-organization', () => {
    // /me attaches `school` for members of ANY org; the mobile School surface
    // is enabled per-org via feature_flags.sis_settings.school_homepage.
    setUser({ id: 'u1', role: 'parent', school: { id: 'org-2', name: 'Elsewhere Academy', homepage: false } });
    expect(renderHook(() => useSchool()).result.current).toBeNull();
  });

  it('returns null for observers — no school surface for them in v1', () => {
    setUser({ id: 'u1', role: 'observer', school: { id: 'org-1', name: 'iCreate', homepage: true } });
    expect(renderHook(() => useSchool()).result.current).toBeNull();
  });

  it('superadmin always sees the surface — the preview, with no school of their own', () => {
    setUser({ id: 'sa', role: 'superadmin', school: null });
    const school = renderHook(() => useSchool()).result.current;
    expect(school).not.toBeNull();
    expect(school?.homepage).toBe(true);
  });

  it('superadmin preview resolves the org\'s NAME so no surface has to say "school"', async () => {
    // iCreate: "we are an education center" — every label uses the org's own
    // name. The preview has no user.school to read it from, so useSchool
    // fetches the context listing once and caches the name.
    __resetSchoolPreviewCache();
    (api.get as jest.Mock).mockResolvedValue({
      data: { success: true, orgs: [{ organization_id: 'org-1', organization_name: 'iCreate' }] },
    });
    setUser({ id: 'sa', role: 'superadmin', school: null });
    const { result } = renderHook(() => useSchool());
    await waitFor(() => expect(result.current?.name).toBe('iCreate'));
    expect(api.get).toHaveBeenCalledWith('/api/sis/school/context');
  });
});

describe('useSchoolHub', () => {
  const contextPayload = {
    data: {
      success: true,
      orgs: [{ organization_id: 'org-1', organization_name: 'iCreate', is_guardian: true, post_registration_flow: 'goals', logo_url: null }],
      is_guardian: true,
    },
  };
  const feedPayload = {
    data: {
      success: true,
      feed: {
        announcements: [{ id: 'a1', title: 'Hi', body: '<p>Hello</p>', pinned: false, priority: 'normal', created_at: '2026-08-01T00:00:00Z' }],
        events: [], lost_found: [], recognition: [],
        carpool: [{ id: 'c1', type: 'offer', message: 'Seats from Provo', author_name: 'Dana', created_at: '2026-08-01T00:00:00Z', mine: false }],
      },
      organization_name: 'iCreate',
      can_post_carpool: true,
      can_moderate: false,
    },
  };

  const primeGets = () => {
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.startsWith('/api/sis/school/context')) return Promise.resolve(contextPayload);
      if (url.startsWith('/api/sis/community/feed')) return Promise.resolve(feedPayload);
      return Promise.resolve({ data: {} });
    });
  };

  it('loads school context and the community feed together', async () => {
    primeGets();
    const { result } = renderHook(() => useSchoolHub());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.org?.organization_id).toBe('org-1');
    expect(result.current.feed?.announcements).toHaveLength(1);
    expect(result.current.carpool.canPost).toBe(true);
    expect(result.current.carpool.canModerate).toBe(false);
    expect(result.current.schoolName).toBe('iCreate');
  });

  it('degrades to an empty hub when the feed call fails', async () => {
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.startsWith('/api/sis/school/context')) return Promise.resolve(contextPayload);
      return Promise.reject(new Error('boom'));
    });
    const { result } = renderHook(() => useSchoolHub());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.feed).toBeNull();
    expect(result.current.org?.organization_id).toBe('org-1');
  });

  it('postCarpool sends the form and refreshes the feed', async () => {
    primeGets();
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useSchoolHub());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const feedCallsBefore = (api.get as jest.Mock).mock.calls
      .filter(([u]) => String(u).startsWith('/api/sis/community/feed')).length;

    await act(async () => {
      await result.current.carpool.post({ type: 'offer', message: 'Seats', area: 'Provo', days: 'MWF' });
    });

    expect(api.post).toHaveBeenCalledWith('/api/sis/community/feed/carpool',
      { type: 'offer', message: 'Seats', area: 'Provo', days: 'MWF' });
    const feedCallsAfter = (api.get as jest.Mock).mock.calls
      .filter(([u]) => String(u).startsWith('/api/sis/community/feed')).length;
    expect(feedCallsAfter).toBe(feedCallsBefore + 1);
  });

  it('messageCarpool posts to the per-post message endpoint', async () => {
    primeGets();
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useSchoolHub());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.carpool.message('c1', 'Is the Tuesday seat open?');
    });
    expect(api.post).toHaveBeenCalledWith('/api/sis/community/feed/carpool/c1/message',
      { message: 'Is the Tuesday seat open?' });
  });

  it('removeCarpool deletes and refreshes', async () => {
    primeGets();
    (api.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useSchoolHub());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.carpool.remove('c1');
    });
    expect(api.delete).toHaveBeenCalledWith('/api/sis/community/feed/carpool/c1');
  });

  it('superadmin preview: waits for context, then reads the feed with the org named', async () => {
    setUser({ id: 'sa', role: 'superadmin', school: null });
    (api.get as jest.Mock).mockImplementation((url: string, config?: any) => {
      if (url.startsWith('/api/sis/school/context')) return Promise.resolve(contextPayload);
      if (url.startsWith('/api/sis/community/feed')) {
        // The preview MUST name the org — a superadmin has no membership to
        // resolve it from.
        expect(config?.params).toEqual({ organization_id: 'org-1', view_as: 'parent' });
        return Promise.resolve(feedPayload);
      }
      return Promise.resolve({ data: {} });
    });
    const { result } = renderHook(() => useSchoolHub());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.feed?.announcements).toHaveLength(1);
    expect(result.current.org?.organization_id).toBe('org-1');
  });
});

describe('useSchoolArchive', () => {
  const page = (items: any[], total: number) => ({
    data: { success: true, announcements: items, total, organization_name: 'iCreate' },
  });
  const item = (id: string) => ({ id, title: `Msg ${id}`, message: 'body', content: 'body', created_at: '2026-08-01T00:00:00Z' });

  it('loads the first page and reports hasMore', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce(page([item('1'), item('2')], 5));
    const { result } = renderHook(() => useSchoolArchive());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(api.get).toHaveBeenCalledWith('/api/announcements/archive', {
      params: { limit: 20, offset: 0 },
    });
    expect(result.current.announcements).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);
  });

  it('loadMore appends the next offset', async () => {
    (api.get as jest.Mock)
      .mockResolvedValueOnce(page([item('1')], 2))
      .mockResolvedValueOnce(page([item('2')], 2));
    const { result } = renderHook(() => useSchoolArchive());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.loadMore(); });

    expect(api.get).toHaveBeenLastCalledWith('/api/announcements/archive', {
      params: { limit: 20, offset: 1 },
    });
    expect(result.current.announcements.map((a: any) => a.id)).toEqual(['1', '2']);
    expect(result.current.hasMore).toBe(false);
  });

  it('search resets to offset 0 with the query', async () => {
    (api.get as jest.Mock).mockResolvedValue(page([item('1')], 1));
    const { result } = renderHook(() => useSchoolArchive());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { result.current.setQuery('festival'); });

    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/api/announcements/archive', {
      params: { limit: 20, offset: 0, q: 'festival' },
    }));
  });

  it('surfaces errors', async () => {
    (api.get as jest.Mock).mockRejectedValueOnce({ response: { data: { error: 'nope' } } });
    const { result } = renderHook(() => useSchoolArchive());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('nope');
  });

  it('names the org on every read when given one (superadmin preview)', async () => {
    (api.get as jest.Mock).mockResolvedValue(page([item('1')], 1));
    renderHook(() => useSchoolArchive({ organizationId: 'org-1' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/announcements/archive', {
      params: { limit: 20, offset: 0, organization_id: 'org-1', view_as: 'parent' },
    }));
  });
});

describe('useSchoolAbsences', () => {
  const parentContext = {
    data: {
      success: true,
      orgs: [{
        organization_id: 'org-1',
        organization_name: 'iCreate',
        students: [
          { student_id: 's1', name: 'Jane' },
          { student_id: 's2', name: 'Milo' },
        ],
      }],
    },
  };
  const absencesPayload = {
    data: {
      success: true,
      absences: [{ id: 'ab1', absence_date: '2026-08-15', class_id: null, reason: 'trip' }],
      classes: [{ class_id: 'cl1', name: 'Pottery' }],
    },
  };

  const primeGets = () => {
    (api.get as jest.Mock).mockImplementation((url: string) => {
      if (url.startsWith('/api/sis/parent/context')) return Promise.resolve(parentContext);
      if (url.startsWith('/api/sis/parent/absences')) return Promise.resolve(absencesPayload);
      return Promise.resolve({ data: {} });
    });
  };

  it('loads guardian context, defaults to the first child, and fetches their absences', async () => {
    primeGets();
    const { result } = renderHook(() => useSchoolAbsences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.students.map((s: any) => s.student_id)).toEqual(['s1', 's2']);
    expect(result.current.studentId).toBe('s1');
    await waitFor(() => expect(result.current.absences).toHaveLength(1));
    expect(result.current.classes).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith(
      '/api/sis/parent/absences?organization_id=org-1&student_user_id=s1',
    );
  });

  it('is empty (not an error) for a non-guardian', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { success: true, orgs: [] } });
    const { result } = renderHook(() => useSchoolAbsences());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.students).toEqual([]);
    expect(result.current.absences).toEqual([]);
  });

  it('report posts the absence and reloads the list', async () => {
    primeGets();
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useSchoolAbsences());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.absences).toHaveLength(1));

    await act(async () => {
      await result.current.report({ absence_date: '2026-08-20', class_id: null, reason: 'dentist' });
    });

    expect(api.post).toHaveBeenCalledWith('/api/sis/parent/absences', {
      organization_id: 'org-1',
      student_user_id: 's1',
      absence_date: '2026-08-20',
      class_id: null,
      reason: 'dentist',
    });
  });

  it('cancel deletes the absence', async () => {
    primeGets();
    (api.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useSchoolAbsences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.cancel('ab1'); });
    expect(api.delete).toHaveBeenCalledWith('/api/sis/parent/absences/ab1');
  });

  it('switching students refetches their absences', async () => {
    primeGets();
    const { result } = renderHook(() => useSchoolAbsences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { result.current.setStudentId('s2'); });

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(
      '/api/sis/parent/absences?organization_id=org-1&student_user_id=s2',
    ));
  });
});
