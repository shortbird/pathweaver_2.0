/**
 * One child's card on the Family tab: a top row that opens the child
 * (picture inside it, tap to set), stat line, quests with rhythm, the
 * weekly goal line, and a count of the friend requests waiting on the
 * parent (answered on the child's Friends screen).
 */

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { ChildCard } from '../ChildCard';
import { useChildDashboard } from '@/src/hooks/useParent';
import { useWeeklyXpGoal } from '@/src/hooks/useWeeklyXpGoal';
import { uploadChildAvatar } from '@/src/services/api';
import { createMockChild } from '@/src/__tests__/utils/mockFactories';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);
jest.mock('@/src/hooks/useParent', () => ({ useChildDashboard: jest.fn() }));
jest.mock('@/src/hooks/useWeeklyXpGoal', () => ({
  useWeeklyXpGoal: jest.fn(),
  XP_GOAL_PRESETS: [250, 500, 750, 1000],
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@/src/utils/alerts', () => ({
  showAlert: jest.fn(),
  confirmAlert: jest.fn().mockResolvedValue(true),
}));

const child = createMockChild({ id: 'kid-1', first_name: 'Romney', last_name: 'Hanna', display_name: 'Romney Hanna', avatar_url: null });

const summary = {
  student: { total_xp: 1250, streak_days: 4, avatar_url: null },
  learning_rhythm: { last_activity_date: new Date(Date.now() - 2 * 86400000).toISOString() },
  stats: { active_quests_count: 4 },
  active_quests: [
    { quest_id: 'q-1', title: 'Build a drone', rhythm: { state: 'in_flow', state_display: 'In Flow', message: '', pattern_description: '', last_7_days: [{ date: new Date().toISOString().slice(0, 10), intensity: 3 }] } },
    { quest_id: 'q-2', title: 'Second',
      class_assignment: { class_id: 'cls-1', class_name: 'Language Studio B', due_date: null } },
    { quest_id: 'q-3', title: 'Third' },
    { quest_id: 'q-4', title: 'Fourth' },
  ],
};

const noConnections = { pending: [], approved: [] };

function renderCard(props: Partial<React.ComponentProps<typeof ChildCard>> = {}) {
  const handlers = {
    onOpen: jest.fn(), onOpenQuest: jest.fn(), onBrowseQuests: jest.fn(),
    onOpenFriends: jest.fn(),
  };
  const result = render(
    <ChildCard
      child={child}
      refreshKey={0}
      connections={noConnections}
      {...handlers}
      {...props}
    />,
  );
  return { ...result, handlers };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useChildDashboard as jest.Mock).mockReturnValue({ data: summary, loading: false, refetch: jest.fn() });
  (useWeeklyXpGoal as jest.Mock).mockReturnValue({ goal: null, loading: false, saving: false, save: jest.fn(), clear: jest.fn() });
});

describe('ChildCard', () => {
  it('sums the child up in one line and lists up to three quests with their rhythm', () => {
    const { getByText, getByLabelText, queryByText } = renderCard();
    expect(getByText('1,250 XP · 4 active quests · 4-day streak · Active 2d ago')).toBeTruthy();
    expect(getByText('Build a drone')).toBeTruthy();
    expect(getByText('Third')).toBeTruthy();
    expect(queryByText('Fourth')).toBeNull();
    expect(getByText('and 1 more')).toBeTruthy();
    // Rhythm, not a progress bar: the label and the seven-day map.
    expect(getByText('Active')).toBeTruthy();
    expect(getByLabelText('Open Build a drone with Romney')).toBeTruthy();
  });

  it('names the class under a quest a class set, and nothing under a free choice', () => {
    // Ticket 55ef3acf: a class quest sat on the list like any other, so a
    // parent could not tell Language Studio B's vocab quest from a quest the
    // child picked, nor find it by the class name they knew.
    const { getByTestId, queryByTestId, getByText } = renderCard();
    expect(getByText('Language Studio B')).toBeTruthy();
    expect(getByTestId('child-quest-class-q-2')).toBeTruthy();
    expect(queryByTestId('child-quest-class-q-1')).toBeNull();
  });

  it('opens the child from the top row, a quest from its row, and the catalog from its line', () => {
    // The row carried an Open button until 2026-09-18, with the name beside
    // it going to the profile instead; the whole top row is one target now.
    const { getByText, getByLabelText, queryByText, queryByLabelText, handlers } = renderCard();
    expect(queryByText('Open')).toBeNull();
    // Pressing the name (not the picture) bubbles to the row.
    fireEvent.press(getByText('Romney Hanna'));
    expect(handlers.onOpen).toHaveBeenCalledWith(child);
    expect(queryByLabelText("Open Romney Hanna's profile")).toBeNull();
    fireEvent.press(getByLabelText('Open Build a drone with Romney'));
    expect(handlers.onOpenQuest).toHaveBeenCalledWith(child, 'q-1');
    fireEvent.press(getByLabelText('Browse quests for Romney'));
    expect(handlers.onBrowseQuests).toHaveBeenCalledWith(child);
  });

  it('tapping the picture uploads a photo to this child', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://pic.jpg', fileName: 'pic.jpg', mimeType: 'image/jpeg' }],
    });
    const { getByLabelText } = renderCard();
    fireEvent.press(getByLabelText("Change Romney's profile picture"));
    await waitFor(() => expect(uploadChildAvatar).toHaveBeenCalledWith('kid-1', {
      uri: 'file://pic.jpg', name: 'pic.jpg', type: 'image/jpeg',
    }));
  });

  it('says so when the child has no quests, and still stands with no summary at all', () => {
    (useChildDashboard as jest.Mock).mockReturnValue({ data: { ...summary, active_quests: [] }, loading: false, refetch: jest.fn() });
    const first = renderCard();
    expect(first.getByText('No quests yet.')).toBeTruthy();
    expect(first.getByLabelText('Browse quests for Romney')).toBeTruthy();
    first.unmount();

    (useChildDashboard as jest.Mock).mockReturnValue({ data: null, loading: true, refetch: jest.fn() });
    const second = renderCard();
    expect(second.getByText('Romney Hanna')).toBeTruthy();
    expect(second.getByText('850 XP')).toBeTruthy();
    expect(second.getByTestId('child-open-kid-1')).toBeTruthy();
  });

  it('shows the weekly goal as one line with a bar, and lets the parent change it', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    (useWeeklyXpGoal as jest.Mock).mockReturnValue({
      goal: { enabled: true, target_xp: 500, xp_earned: 320, percent: 64, met: false, remaining_xp: 180, note: null, can_edit: true },
      loading: false, saving: false, save, clear: jest.fn(),
    });
    const { getByText, getByLabelText } = renderCard();
    expect(getByText('Weekly goal')).toBeTruthy();
    expect(getByText('320 / 500 XP')).toBeTruthy();
    expect(getByLabelText('Weekly XP goal progress')).toBeTruthy();

    fireEvent.press(getByText('Change'));
    fireEvent.press(getByText('750'));
    fireEvent.press(getByText('Save goal'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(750, null));
  });

  it('counts the friend requests waiting on the parent and opens the Friends screen', () => {
    /* The full consent card (what the other child would see, Approve /
       Decline) lives on the child's Friends screen since 2026-09-15; the
       card carries the count and the door, the way the web card does. */
    const connections = {
      pending: [{
        id: 'r-1', connection_id: 'c-1', approver_kind: 'parent' as const,
        child: { id: 'kid-1', display_name: 'Romney Hanna' }, peer: { id: 'peer-1', display_name: 'Tyler T.' },
      }],
      approved: [{ connection_id: 'c-0', child: { id: 'kid-1', display_name: 'Romney Hanna' }, peer: { id: 'peer-0', display_name: 'Banks H.' } }],
    };
    const { getByText, queryByText, handlers } = renderCard({ connections });
    expect(getByText('Friend request waiting for you')).toBeTruthy();
    expect(queryByText('Approve')).toBeNull();
    expect(queryByText('Connected with Banks H.')).toBeNull();

    fireEvent.press(getByText('Friend request waiting for you'));
    expect(handlers.onOpenFriends).toHaveBeenCalledWith(child);
  });

  it('shows nothing about friends when no request is waiting', () => {
    const { queryByText } = renderCard();
    expect(queryByText(/waiting for you/)).toBeNull();
  });
});
