/**
 * EvolveTopicModal tests - AI preview, edit, create quest.
 *
 * Regression for the mobile Evolve button posting an empty body and every tap
 * failing with "Request body is required".
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { EvolveTopicModal } from '../EvolveTopicModal';
import { previewEvolvedQuest, evolveTrackToQuest } from '@/src/hooks/useJournal';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/hooks/useJournal', () => ({
  ...jest.requireActual('@/src/hooks/useJournal'),
  previewEvolvedQuest: jest.fn(),
  evolveTrackToQuest: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const preview = {
  title: 'Parkour Progression',
  description: 'Flips, vaults and landings across the gym.',
  tasks: [
    { title: 'Land a front flip', description: 'Off a pad onto a tramp', pillar: 'wellness', xp_value: 50 },
    { title: 'Film a run', description: 'Chain three moves', pillar: 'art', xp_value: 75 },
  ],
  total_xp: 125,
  primary_pillar: 'wellness',
  learning_outcomes: ['Body control'],
};

const onClose = jest.fn();
const onSuccess = jest.fn();

function renderModal(props: Partial<React.ComponentProps<typeof EvolveTopicModal>> = {}) {
  return render(
    <EvolveTopicModal
      visible
      trackId="track-1"
      trackName="Parkour"
      momentCount={34}
      onClose={onClose}
      onSuccess={onSuccess}
      {...props}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (previewEvolvedQuest as jest.Mock).mockResolvedValue({ success: true, preview, moment_count: 34, track_name: 'Parkour' });
  (evolveTrackToQuest as jest.Mock).mockResolvedValue({ success: true, quest_id: 'quest-9' });
});

describe('EvolveTopicModal', () => {
  it('fetches the AI preview when opened and seeds the form with it', async () => {
    const { getByDisplayValue, getByText } = renderModal();

    await waitFor(() => expect(previewEvolvedQuest).toHaveBeenCalledWith('track-1'));
    await waitFor(() => expect(getByDisplayValue('Parkour Progression')).toBeTruthy());
    expect(getByDisplayValue('Flips, vaults and landings across the gym.')).toBeTruthy();
    expect(getByText('Land a front flip')).toBeTruthy();
    expect(getByText('Film a run')).toBeTruthy();
    expect(getByText('Suggested tasks (2)')).toBeTruthy();
    expect(getByText('125 XP')).toBeTruthy();
  });

  it('does not fetch a preview while hidden', () => {
    renderModal({ visible: false });
    expect(previewEvolvedQuest).not.toHaveBeenCalled();
  });

  it('posts the reviewed title, description and tasks, then reports the new quest', async () => {
    const { getByDisplayValue, getByText } = renderModal();
    await waitFor(() => expect(getByDisplayValue('Parkour Progression')).toBeTruthy());

    fireEvent.changeText(getByDisplayValue('Parkour Progression'), '  Parkour Mastery ');
    fireEvent.press(getByText('Create Quest'));

    await waitFor(() => expect(evolveTrackToQuest).toHaveBeenCalledTimes(1));
    expect(evolveTrackToQuest).toHaveBeenCalledWith('track-1', {
      title: 'Parkour Mastery',
      description: 'Flips, vaults and landings across the gym.',
      tasks: preview.tasks,
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('quest-9'));
  });

  it('refuses to create a quest without a title', async () => {
    const { getByDisplayValue, getByText } = renderModal();
    await waitFor(() => expect(getByDisplayValue('Parkour Progression')).toBeTruthy());

    fireEvent.changeText(getByDisplayValue('Parkour Progression'), '   ');
    fireEvent.press(getByText('Create Quest'));

    await new Promise((r) => setTimeout(r, 0));
    expect(evolveTrackToQuest).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows the preview error with a retry', async () => {
    (previewEvolvedQuest as jest.Mock)
      .mockResolvedValueOnce({ success: false, error: 'Track needs at least 5 moments to evolve (currently has 2)' })
      .mockResolvedValueOnce({ success: true, preview });
    const { getByText, getByDisplayValue, queryByText } = renderModal();

    await waitFor(() => expect(getByText('Track needs at least 5 moments to evolve (currently has 2)')).toBeTruthy());
    expect(queryByText('Create Quest')).toBeNull();

    fireEvent.press(getByText('Try Again'));

    await waitFor(() => expect(previewEvolvedQuest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getByDisplayValue('Parkour Progression')).toBeTruthy());
  });

  it('surfaces the backend error when creating the quest fails', async () => {
    (evolveTrackToQuest as jest.Mock).mockRejectedValueOnce({ response: { data: { error: 'Quest title is required' } } });
    const { getByDisplayValue, getByText } = renderModal();
    await waitFor(() => expect(getByDisplayValue('Parkour Progression')).toBeTruthy());

    fireEvent.press(getByText('Create Quest'));

    await waitFor(() => expect(getByText('Quest title is required')).toBeTruthy());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
