/**
 * Requesting diploma credit on a finished task, from the app.
 *
 * The web has offered Request Credit on a completed task since the credit
 * dashboard shipped; the app could only list requests, never make one.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import api from '@/src/services/api';
import { offersTaskCredit, useTaskCredit } from '../useTaskCredit';
import { createMockUser, createMockParent } from '@/src/__tests__/utils/mockFactories';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

const status = (diploma_status: string | null, extra: Record<string, unknown> = {}) => ({
  data: { success: true, data: { has_completion: diploma_status !== null, diploma_status }, ...extra },
});

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue(status('none'));
});

describe('offersTaskCredit', () => {
  const task = { id: 't1' };
  const student = createMockUser();
  const parent = createMockParent();

  it('offers credit on an ordinary quest task to a student', () => {
    expect(offersTaskCredit({ task, quest: { quest_type: 'optio' }, viewer: student })).toBe(true);
  });

  it('keeps class quest tasks out: a class is credited once, as a class', () => {
    expect(offersTaskCredit({ task, quest: { quest_type: 'class' }, viewer: student })).toBe(false);
  });

  it('lets an own-curriculum course credit per task, as the web does', () => {
    const quest = { quest_type: 'class', metadata: { course_format: 'own_curriculum' } };
    expect(offersTaskCredit({ task, quest, viewer: student })).toBe(true);
  });

  it('never offers a parent credit on their own quest, but does on a child\'s', () => {
    const quest = { quest_type: 'optio' };
    expect(offersTaskCredit({ task, quest, viewer: parent })).toBe(false);
    expect(offersTaskCredit({ task, quest, viewer: parent, studentId: 'kid-1' })).toBe(true);
  });

  it('treats an org-managed parent the same as a platform parent', () => {
    const orgParent = createMockUser({ role: 'org_managed', org_role: 'parent', organization_id: 'org-1' } as any);
    expect(offersTaskCredit({ task, quest: { quest_type: 'optio' }, viewer: orgParent })).toBe(false);
  });

  it('skips journal moments, which are not completion rows', () => {
    expect(offersTaskCredit({ task: { id: 'moment-abc' }, quest: null, viewer: student })).toBe(false);
    expect(offersTaskCredit({ task: { id: 't2', is_moment: true }, quest: null, viewer: student })).toBe(false);
  });
});

describe('useTaskCredit', () => {
  it('reads the task\'s credit status', async () => {
    (api.get as jest.Mock).mockResolvedValue(status('grow_this'));
    const { result } = renderHook(() => useTaskCredit('t1'));
    await waitFor(() => expect(result.current.status).toBe('grow_this'));
    expect(api.get).toHaveBeenCalledWith('/api/tasks/t1/credit-status', undefined);
  });

  it('shows nothing when there is no completion row', async () => {
    (api.get as jest.Mock).mockResolvedValue(status(null));
    const { result } = renderHook(() => useTaskCredit('t1'));
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(result.current.status).toBeNull();
  });

  it('in parent mode reads the child\'s status and trusts only a scoped answer', async () => {
    // A backend that ignored student_id answers with the parent's own row.
    (api.get as jest.Mock).mockResolvedValue(status('finalized'));
    const { result, rerender } = renderHook(
      ({ sid }: { sid: string }) => useTaskCredit('t1', { studentId: sid }), { initialProps: { sid: 'kid-1' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(api.get).toHaveBeenCalledWith('/api/tasks/t1/credit-status', { params: { student_id: 'kid-1' } });
    expect(result.current.status).toBeNull();

    (api.get as jest.Mock).mockResolvedValue(
      status('none', { scope: { delegated: true, student_id: 'kid-2' } }));
    rerender({ sid: 'kid-2' });
    await waitFor(() => expect(result.current.status).toBe('none'));
  });

  it('opens the precheck and holds the answer for the student to decide on', async () => {
    const answer = { available: true, likelihood: 'needs_work', criteria: [] };
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true, data: answer } });
    const { result } = renderHook(() => useTaskCredit('t1'));
    await waitFor(() => expect(result.current.status).toBe('none'));

    await act(async () => { await result.current.requestCredit(); });
    expect(api.post).toHaveBeenCalledWith('/api/tasks/t1/credit-precheck', {});
    expect(result.current.precheckOpen).toBe(true);
    expect(result.current.precheck).toEqual(answer);
    // Nothing is requested until the student chooses to submit.
    expect(api.post).toHaveBeenCalledTimes(1);

    (api.post as jest.Mock).mockResolvedValueOnce({
      data: { success: true, data: { success: true, diploma_status: 'pending_review' } },
    });
    await act(async () => { await result.current.submit(); });
    expect(api.post).toHaveBeenLastCalledWith('/api/tasks/t1/request-credit', {});
    expect(result.current.status).toBe('pending_review');
    expect(result.current.precheckOpen).toBe(false);
  });

  it('submits straight away when AI is off for the student', async () => {
    (api.post as jest.Mock)
      .mockResolvedValueOnce({ data: { data: { available: false, reason: 'ai_disabled' } } })
      .mockResolvedValueOnce({ data: { data: { success: true, diploma_status: 'pending_org_approval' } } });
    const { result } = renderHook(() => useTaskCredit('t1', { studentId: null }));
    await waitFor(() => expect(result.current.status).toBe('none'));

    await act(async () => { await result.current.requestCredit(); });
    expect(api.post).toHaveBeenLastCalledWith('/api/tasks/t1/request-credit', {});
    expect(result.current.status).toBe('pending_org_approval');
    expect(result.current.precheckOpen).toBe(false);
  });

  it('files a parent\'s request as the child\'s', async () => {
    (api.get as jest.Mock).mockResolvedValue(
      status('none', { scope: { delegated: true, student_id: 'kid-1' } }));
    (api.post as jest.Mock)
      .mockResolvedValueOnce({ data: { data: { available: false, reason: 'disabled' } } })
      .mockResolvedValueOnce({ data: { data: { success: true, diploma_status: 'pending_review' } } });
    const { result } = renderHook(() => useTaskCredit('t1', { studentId: 'kid-1' }));
    await waitFor(() => expect(result.current.status).toBe('none'));

    await act(async () => { await result.current.requestCredit(); });
    expect(api.post).toHaveBeenCalledWith('/api/tasks/t1/credit-precheck', { student_id: 'kid-1' });
    expect(api.post).toHaveBeenLastCalledWith('/api/tasks/t1/request-credit', { student_id: 'kid-1' });
  });

  it('turns a 429 into the rate-limited answer, and still lets them submit', async () => {
    (api.post as jest.Mock).mockRejectedValueOnce({ response: { status: 429, data: {} } });
    const { result } = renderHook(() => useTaskCredit('t1'));
    await waitFor(() => expect(result.current.status).toBe('none'));

    await act(async () => { await result.current.requestCredit(); });
    expect(result.current.precheck).toEqual({ available: false, reason: 'rate_limited' });
    expect(result.current.precheckOpen).toBe(true);
  });

  it('keeps the server\'s words when the request is refused', async () => {
    (api.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 400, data: { error: { code: 'ALREADY_PENDING', message: 'Credit request is already pending review.' } } },
    });
    const { result } = renderHook(() => useTaskCredit('t1'));
    await waitFor(() => expect(result.current.status).toBe('none'));

    await act(async () => { await result.current.submit(); });
    expect(result.current.error).toBe('Credit request is already pending review.');
    expect(result.current.status).toBe('none');
  });

  it('a precheck that answers after the sheet closed changes nothing', async () => {
    let resolve!: (v: unknown) => void;
    (api.post as jest.Mock).mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useTaskCredit('t1'));
    await waitFor(() => expect(result.current.status).toBe('none'));

    let pending!: Promise<void>;
    act(() => { pending = result.current.requestCredit(); });
    act(() => { result.current.closePrecheck(); });
    await act(async () => {
      resolve({ data: { data: { available: false, reason: 'ai_disabled' } } });
      await pending;
    });
    expect(result.current.precheckOpen).toBe(false);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
