/**
 * useQuestDetail hook tests - quest fetching, session management,
 * task generation, accept, complete, delete, block normalization.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useQuestDetail } from '../useQuestDetail';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

const mockQuest = {
  id: 'quest-1',
  title: 'Test Quest',
  description: 'A test quest',
  header_image_url: null,
  image_url: null,
  quest_type: 'standard',
  approach_examples: [],
  allow_custom_tasks: true,
  is_active: true,
  user_enrollment: { id: 'enroll-1' },
  completed_enrollment: null,
  quest_tasks: [
    { id: 'task-1', title: 'Existing Task', pillar: 'stem', xp_value: 50, is_completed: false, order_index: 0 },
  ],
  template_tasks: [],
  sample_tasks: [],
  preset_tasks: [],
  has_template_tasks: false,
  progress: null,
};

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
});

afterEach(() => {
  clearAuthState();
});

describe('useQuestDetail', () => {
  it('fetches quest data from /api/quests/{id}', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { quest: mockQuest } });

    const { result } = renderHook(() => useQuestDetail('quest-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/quests/quest-1');
    expect(result.current.quest?.title).toBe('Test Quest');
    expect(result.current.quest?.quest_tasks).toHaveLength(1);
  });

  it('sets error when quest fetch fails', async () => {
    (api.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { error: 'Quest not found' } },
    });

    const { result } = renderHook(() => useQuestDetail('bad-id'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Quest not found');
    expect(result.current.quest).toBeNull();
  });

  it('returns early when questId is null', async () => {
    const { result } = renderHook(() => useQuestDetail(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('generateTasks', () => {
  it('calls start-personalization for session_id then generate-tasks', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { quest: mockQuest } });
    (api.post as jest.Mock)
      .mockResolvedValueOnce({ data: { session_id: 'session-abc' } }) // start-personalization
      .mockResolvedValueOnce({ data: { tasks: [{ title: 'AI Task', pillar: 'art', xp_value: 100 }] } }); // generate-tasks

    const { result } = renderHook(() => useQuestDetail('quest-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let tasks: any[];
    await act(async () => {
      tasks = await result.current.generateTasks('photography', 'art');
    });

    expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/start-personalization', {});
    expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/generate-tasks', expect.objectContaining({
      session_id: 'session-abc',
      approach: 'hybrid',
      interests: ['photography'],
      exclude_tasks: ['Existing Task'],
    }));
    expect(tasks!).toHaveLength(1);
    expect(tasks![0].title).toBe('AI Task');
  });

  it('reuses session_id on subsequent calls', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { quest: mockQuest } });
    (api.post as jest.Mock)
      .mockResolvedValueOnce({ data: { session_id: 'session-abc' } }) // start-personalization (first call only)
      .mockResolvedValueOnce({ data: { tasks: [] } }) // first generate
      .mockResolvedValueOnce({ data: { tasks: [] } }); // second generate

    const { result } = renderHook(() => useQuestDetail('quest-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.generateTasks(); });
    await act(async () => { await result.current.generateTasks(); });

    // start-personalization should only be called once
    const startCalls = (api.post as jest.Mock).mock.calls.filter(
      (c: any[]) => c[0].includes('start-personalization')
    );
    expect(startCalls).toHaveLength(1);
  });
});

describe('acceptTask', () => {
  it('calls accept-task with session_id and optimistically adds task', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { quest: mockQuest } });
    (api.post as jest.Mock)
      .mockResolvedValueOnce({ data: { session_id: 'session-abc' } }) // start-personalization
      .mockResolvedValueOnce({ data: { success: true, task_id: 'task-new' } }); // accept-task

    const { result } = renderHook(() => useQuestDetail('quest-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newTask = { title: 'New Task', pillar: 'art', xp_value: 75 };
    await act(async () => {
      await result.current.acceptTask(newTask);
    });

    expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/personalization/accept-task', {
      session_id: 'session-abc',
      task: newTask,
    });

    // Task should be optimistically added to local state
    expect(result.current.quest?.quest_tasks).toHaveLength(2);
    expect(result.current.quest?.quest_tasks[1].title).toBe('New Task');
  });
});

describe('completeTask', () => {
  it('normalizes block_type to type before POST', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { quest: mockQuest } });
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useQuestDetail('quest-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const blocks = [
      { block_type: 'text', content: { text: 'My evidence' }, order_index: 0 },
      { block_type: 'image', content: { url: 'http://img.jpg' }, order_index: 1 },
    ];

    await act(async () => {
      await result.current.completeTask('task-1', blocks);
    });

    expect(api.post).toHaveBeenCalledWith('/api/evidence/documents/task-1', {
      blocks: expect.arrayContaining([
        expect.objectContaining({ type: 'text' }),
        expect.objectContaining({ type: 'image' }),
      ]),
      status: 'completed',
    });

    // Task should be marked completed in local state
    expect(result.current.quest?.quest_tasks[0].is_completed).toBe(true);
  });

  it('handles blocks that already have type field', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { quest: mockQuest } });
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useQuestDetail('quest-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const blocks = [{ type: 'text', content: { text: 'Already has type' }, order_index: 0 }];

    await act(async () => {
      await result.current.completeTask('task-1', blocks);
    });

    expect(api.post).toHaveBeenCalledWith('/api/evidence/documents/task-1', {
      blocks: [expect.objectContaining({ type: 'text' })],
      status: 'completed',
    });
  });
});

describe('deleteTask', () => {
  it('calls DELETE /api/tasks/{id} and removes from local state', async () => {
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { quest: mockQuest } });
    (api.delete as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useQuestDetail('quest-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.quest?.quest_tasks).toHaveLength(1);

    await act(async () => {
      await result.current.deleteTask('task-1');
    });

    expect(api.delete).toHaveBeenCalledWith('/api/tasks/task-1');
    expect(result.current.quest?.quest_tasks).toHaveLength(0);
  });
});

describe('enroll', () => {
  it('calls POST /api/quests/{id}/enroll and refetches', async () => {
    (api.get as jest.Mock)
      .mockResolvedValueOnce({ data: { quest: { ...mockQuest, user_enrollment: null } } }) // initial
      .mockResolvedValueOnce({ data: { quest: mockQuest } }); // refetch after enroll
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useQuestDetail('quest-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enroll();
    });

    expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/enroll', {});
  });

  it('passes options (force_new, load_previous_tasks) to enroll API', async () => {
    (api.get as jest.Mock)
      .mockResolvedValueOnce({ data: { quest: { ...mockQuest, user_enrollment: null } } })
      .mockResolvedValueOnce({ data: { quest: mockQuest } });
    (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

    const { result } = renderHook(() => useQuestDetail('quest-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enroll({ force_new: true, load_previous_tasks: true });
    });

    expect(api.post).toHaveBeenCalledWith('/api/quests/quest-1/enroll', {
      force_new: true,
      load_previous_tasks: true,
    });
  });
});
