/**
 * Journal screen tests - renders topics sidebar and unassigned moments.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import JournalScreen from '../journal';
import {
  useUnifiedTopics, useUnassignedMoments, useTrackMoments, useQuestMoments, useQuestTasks,
} from '@/src/hooks/useJournal';
import { useFeed } from '@/src/hooks/useFeed';
import { setAuthAsStudent, clearAuthState } from '@/src/__tests__/utils/authStoreHelper';
import { createMockTopic, createMockLearningEvent } from '@/src/__tests__/utils/mockFactories';

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

// The sidebar is where a topic gets opened; capture its select handler.
let sidebarProps: any = null;
jest.mock('@/src/components/journal/TopicsSidebar', () => ({
  TopicsSidebar: (props: any) => { sidebarProps = props; return null; },
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
jest.mock('@/src/components/journal/GenerateTasksModal', () => ({
  GenerateTasksModal: () => null,
}));
jest.mock('@/src/components/journal/EvolveTopicModal', () => ({
  EvolveTopicModal: () => null,
}));
jest.mock('@/src/components/layouts/MobileHeader', () => ({
  PageHeader: () => null,
}));
jest.mock('@/src/hooks/useFeed', () => ({
  useFeed: jest.fn(),
}));
jest.mock('@/src/components/feed/FeedCard', () => ({
  FeedCard: () => null,
}));

beforeEach(() => {
  setAuthAsStudent();
  jest.clearAllMocks();
  (useTrackMoments as jest.Mock).mockReturnValue({ track: null, moments: [], loading: false });
  (useQuestMoments as jest.Mock).mockReturnValue({ moments: [], loading: false });
  (useQuestTasks as jest.Mock).mockReturnValue({ tasks: [], questTitle: '', loading: false, refetch: jest.fn(), generateTasks: jest.fn(), acceptTask: jest.fn() });
  (useFeed as jest.Mock).mockReturnValue({ items: [], loading: false, loadingMore: false, hasMore: false, loadMore: jest.fn(), refetch: jest.fn() });
});

afterEach(() => {
  clearAuthState();
});

describe('JournalScreen', () => {
  it('renders without crashing and queries unified topics + unassigned moments', () => {
    // The "2 unassigned moments" banner copy was removed when the journal
    // layout was refactored; this test now guards that the screen renders
    // and consults the right hooks for its data.
    const topics = [createMockTopic()];
    const unassigned = [createMockLearningEvent(), createMockLearningEvent({ id: 'e2' })];

    (useUnifiedTopics as jest.Mock).mockReturnValue({
      topics, loading: false, refetch: jest.fn(),
    });
    (useUnassignedMoments as jest.Mock).mockReturnValue({
      moments: unassigned, loading: false, refetch: jest.fn(),
    });

    expect(() => render(<JournalScreen />)).not.toThrow();
    expect(useUnifiedTopics).toHaveBeenCalled();
    expect(useUnassignedMoments).toHaveBeenCalled();
  });
});

/**
 * Tickets bb7b5b20 + 6d9a9c57 (Sentry, 2026-09-24): a parent had one child's
 * "Think" topic open, switched the header to her other child, and the screen
 * asked for the first child's topic under the second child's id -- a 500.
 */
describe('JournalScreen child switch', () => {
  const CHILD_A = 'child-a';
  const CHILD_B = 'child-b';
  const TRACK = 'track-of-child-a';

  beforeEach(() => {
    sidebarProps = null;
    (useUnifiedTopics as jest.Mock).mockReturnValue({ topics: [], loading: false, refetch: jest.fn() });
    (useUnassignedMoments as jest.Mock).mockReturnValue({ moments: [], loading: false, refetch: jest.fn() });
  });

  const lastTrackCall = () => (useTrackMoments as jest.Mock).mock.calls.at(-1);

  it('closes the open topic when the child changes, and never asks for it under the new child', () => {
    const view = render(<JournalScreen studentId={CHILD_A} />);
    act(() => { sidebarProps.onSelectTopic(TRACK, 'track'); });
    expect(lastTrackCall()).toEqual([TRACK, CHILD_A]);

    (useTrackMoments as jest.Mock).mockClear();
    view.rerender(<JournalScreen studentId={CHILD_B} />);

    const calls = (useTrackMoments as jest.Mock).mock.calls;
    expect(calls).not.toContainEqual([TRACK, CHILD_B]);
    expect(lastTrackCall()).toEqual([null, CHILD_B]);
    expect(sidebarProps.selectedId).toBeNull();
    expect(sidebarProps.selectedType).toBe('unassigned');
  });

  it('keeps an open topic when the child first arrives (no switch happened)', () => {
    const view = render(<JournalScreen />);
    act(() => { sidebarProps.onSelectTopic(TRACK, 'track'); });

    view.rerender(<JournalScreen studentId={CHILD_A} />);

    // (The phone layout hides the sidebar once a topic is open, so the hook
    // call is the witness here.)
    expect(lastTrackCall()).toEqual([TRACK, CHILD_A]);
  });

  it('keeps the open topic across a re-render for the same child', () => {
    const view = render(<JournalScreen studentId={CHILD_A} />);
    act(() => { sidebarProps.onSelectTopic(TRACK, 'track'); });

    view.rerender(<JournalScreen studentId={CHILD_A} />);

    expect(lastTrackCall()).toEqual([TRACK, CHILD_A]);
  });
});
