/**
 * Quest detail screen tests - renders quest, task list, add task button.
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import QuestDetailScreen from '../[id]';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/services/tokenStore', () => ({
  tokenStore: {
    restore: jest.fn(),
    setTokens: jest.fn().mockResolvedValue(undefined),
    clearTokens: jest.fn().mockResolvedValue(undefined),
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
  },
}));

const mockQuest = {
  id: 'quest-1',
  title: 'Math Mastery',
  description: 'Master fundamental math concepts',
  header_image_url: null,
  image_url: null,
  quest_type: 'standard',
  approach_examples: [],
  allow_custom_tasks: true,
  is_active: true,
  user_enrollment: { id: 'enroll-1' },
  completed_enrollment: null,
  quest_tasks: [
    { id: 'task-1', title: 'Solve 10 equations', pillar: 'stem', xp_value: 50, is_completed: false, order_index: 0 },
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
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'quest-1' });
  // All GET requests return valid empty data so no promises reject
  (api.get as jest.Mock).mockResolvedValue({ data: { quest: mockQuest, blocks: [], engagement: null } });
});

afterEach(() => {
  clearAuthState();
});

// The AggregateError these files used to swallow was a real failure, not a
// React 19 quirk: `withRepeat` was missing from the reanimated mock, so any
// loading Skeleton threw from its mount effect and render() rethrew it. Fixed
// in src/__tests__/setup.tsx; a throw from render() here is a bug now.

describe('QuestDetailScreen', () => {
  it('renders quest title and description', async () => {
    const result = render(<QuestDetailScreen />);

    await waitFor(() => {
      expect(result.getByText('Math Mastery')).toBeTruthy();
    });
  });

  it('shows quest not found on error', async () => {
    (api.get as jest.Mock).mockRejectedValue({ response: { data: { error: 'Not found' } } });

    const result = render(<QuestDetailScreen />);

    await waitFor(() => {
      expect(result.getByText('Quest not found')).toBeTruthy();
    });
  });
});

describe('long task titles', () => {
  // iCreate orientation, 2026-08-18: tasks carry their instruction in the
  // title ("Find the classroom that has a bright yellow pocket folder in
  // it…", 131 chars). The title was clamped to one line whether or not the
  // task was open, so on a phone families saw about a quarter of it and the
  // edit dialog was the only screen in the app showing the whole thing.
  //
  // 2026-09-04: the collapsed clamp went from one line to two. One line still
  // showed too little of a title like this to know whether it was worth
  // opening, which is half of why a parent reported she could not read a task.
  const longTitle =
    'What should you do before leaving a classroom? Find the classroom that '
    + 'has a bright yellow pocket folder in it to learn the answer.';

  beforeEach(() => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        quest: {
          ...mockQuest,
          quest_tasks: [{
            id: 'task-1', title: longTitle, pillar: 'stem',
            xp_value: 50, is_completed: false, order_index: 0,
          }],
        },
        blocks: [],
        engagement: null,
      },
    });
  });

  it('clamps the title to two lines while the task is collapsed', async () => {
    const result = render(<QuestDetailScreen />);

    await waitFor(() => expect(result.getByText(longTitle)).toBeTruthy());
    expect(result.getByText(longTitle).props.numberOfLines).toBe(2);
  });

  it('shows the whole title once the task is opened', async () => {
    const result = render(<QuestDetailScreen />);

    await waitFor(() => expect(result.getByText(longTitle)).toBeTruthy());
    fireEvent.press(result.getByText(longTitle));

    await waitFor(() => {
      expect(result.getByText(longTitle).props.numberOfLines).toBeUndefined();
    });
  });
});
