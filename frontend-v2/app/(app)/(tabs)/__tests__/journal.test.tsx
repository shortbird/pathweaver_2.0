/**
 * Journal screen tests - renders topics sidebar and unassigned moments.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/hooks/useJournal', () => ({
  useUnifiedTopics: jest.fn(),
  useUnassignedMoments: jest.fn(),
  useTrackMoments: jest.fn(),
  useQuestMoments: jest.fn(),
  useQuestTasks: jest.fn(),
}));

jest.mock('@/src/components/journal/TopicsSidebar', () => ({
  TopicsSidebar: () => null,
}));
jest.mock('@/src/components/journal/LearningEventCard', () => ({
  LearningEventCard: () => null,
}));
jest.mock('@/src/components/capture/CaptureSheet', () => ({
  CaptureSheet: () => null,
}));
jest.mock('@/src/components/capture/CaptureModal', () => ({
  CaptureModal: () => null,
}));
jest.mock('@/src/components/journal/EditMomentModal', () => ({
  EditMomentModal: () => null,
}));
jest.mock('@/src/components/journal/QuestTasksSection', () => ({
  QuestTasksSection: () => null,
}));
jest.mock('@/src/components/journal/GenerateTasksModal', () => ({
  GenerateTasksModal: () => null,
}));
jest.mock('@/src/components/layouts/MobileHeader', () => ({
  PageHeader: () => null,
}));

import React from 'react';
import { render } from '@testing-library/react-native';
import JournalScreen from '../journal';
import {
  useUnifiedTopics, useUnassignedMoments, useTrackMoments, useQuestMoments, useQuestTasks,
} from '@/src/hooks/useJournal';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockTopic, createMockLearningEvent } from '@/src/__tests__/utils/mockFactories';

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  (useTrackMoments as jest.Mock).mockReturnValue({ track: null, moments: [], loading: false });
  (useQuestMoments as jest.Mock).mockReturnValue({ moments: [], loading: false });
  (useQuestTasks as jest.Mock).mockReturnValue({ tasks: [], questTitle: '', loading: false, refetch: jest.fn(), generateTasks: jest.fn(), acceptTask: jest.fn() });
});

afterEach(() => {
  clearAuthState();
});

describe('JournalScreen', () => {
  it('renders journal page with unassigned moments count', () => {
    const topics = [createMockTopic()];
    const unassigned = [createMockLearningEvent(), createMockLearningEvent({ id: 'e2' })];

    (useUnifiedTopics as jest.Mock).mockReturnValue({
      topics, loading: false, refetch: jest.fn(),
    });
    (useUnassignedMoments as jest.Mock).mockReturnValue({
      moments: unassigned, loading: false, refetch: jest.fn(),
    });

    const { getByText } = render(<JournalScreen />);

    // Mobile shows unassigned banner when there are unassigned moments
    expect(getByText('2 unassigned moments')).toBeTruthy();
  });
});
