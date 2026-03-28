/**
 * useJournal hook tests - topics, unassigned moments, create moment/topic.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

import { renderHook, waitFor } from '@testing-library/react-native';
import { useUnifiedTopics, useUnassignedMoments } from '../useJournal';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockTopic, createMockLearningEvent } from '@/src/__tests__/utils/mockFactories';

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
});

afterEach(() => {
  clearAuthState();
});

describe('useUnifiedTopics', () => {
  it('fetches from /api/topics/unified and merges topics + course_topics', async () => {
    const topics = [createMockTopic(), createMockTopic({ id: 'topic-2', name: 'Art Portfolio' })];
    const courseTopics = [{ id: 'course-1', name: 'Math 101', type: 'course' }];
    (api.get as jest.Mock).mockResolvedValueOnce({
      data: { topics, course_topics: courseTopics },
    });

    const { result } = renderHook(() => useUnifiedTopics());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/topics/unified');
    // Should merge both arrays
    expect(result.current.topics).toHaveLength(3);
    expect(result.current.topics[2].type).toBe('course');
  });
});

describe('useUnassignedMoments', () => {
  it('fetches from /api/learning-events/unassigned', async () => {
    const moments = [createMockLearningEvent(), createMockLearningEvent({ id: 'event-2' })];
    (api.get as jest.Mock).mockResolvedValueOnce({ data: { moments } });

    const { result } = renderHook(() => useUnassignedMoments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.get).toHaveBeenCalledWith('/api/learning-events/unassigned');
    expect(result.current.moments).toHaveLength(2);
  });
});

describe('journal actions', () => {
  it('create learning moment: POST /api/learning-events/quick with FormData', async () => {
    const formData = new FormData();
    formData.append('description', 'Learned about photosynthesis');
    formData.append('source_type', 'realtime');

    (api.post as jest.Mock).mockResolvedValueOnce({ data: { id: 'new-event' } });

    await api.post('/api/learning-events/quick', formData);

    expect(api.post).toHaveBeenCalledWith('/api/learning-events/quick', formData);
  });

  it('create new topic: POST /api/interest-tracks with name/color', async () => {
    const trackData = { name: 'Robotics Club', color: '#FF5733', icon: 'hardware-chip-outline' };

    (api.post as jest.Mock).mockResolvedValueOnce({ data: { track: { id: 'track-new', ...trackData } } });

    await api.post('/api/interest-tracks', trackData);

    expect(api.post).toHaveBeenCalledWith('/api/interest-tracks', trackData);
  });
});
