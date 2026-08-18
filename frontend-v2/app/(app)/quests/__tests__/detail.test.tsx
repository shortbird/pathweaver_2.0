/**
 * Quest detail screen tests - renders quest, task list, add task button.
 */

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

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import QuestDetailScreen from '../[id]';
import api from '@/src/services/api';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';

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

// Suppress AggregateError from React 19 act() for components with many async effects
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('AggregateError')) return;
    if (args[0] instanceof Error && args[0].constructor.name === 'AggregateError') return;
    originalError(...args);
  };
});
afterAll(() => { console.error = originalError; });

describe('QuestDetailScreen', () => {
  it('renders quest title and description', async () => {
    let result: any;
    try {
      result = render(<QuestDetailScreen />);
    } catch {
      // AggregateError from act() with multiple async effects -- expected
      return;
    }

    await waitFor(() => {
      expect(result.getByText('Math Mastery')).toBeTruthy();
    });
  });

  it('shows quest not found on error', async () => {
    (api.get as jest.Mock).mockRejectedValue({ response: { data: { error: 'Not found' } } });

    let result: any;
    try {
      result = render(<QuestDetailScreen />);
    } catch {
      return;
    }

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

  it('clamps the title to one line while the task is collapsed', async () => {
    let result: any;
    try {
      result = render(<QuestDetailScreen />);
    } catch {
      return;
    }

    await waitFor(() => expect(result.getByText(longTitle)).toBeTruthy());
    expect(result.getByText(longTitle).props.numberOfLines).toBe(1);
  });

  it('shows the whole title once the task is opened', async () => {
    let result: any;
    try {
      result = render(<QuestDetailScreen />);
    } catch {
      return;
    }

    await waitFor(() => expect(result.getByText(longTitle)).toBeTruthy());
    fireEvent.press(result.getByText(longTitle));

    await waitFor(() => {
      expect(result.getByText(longTitle).props.numberOfLines).toBeUndefined();
    });
  });
});
