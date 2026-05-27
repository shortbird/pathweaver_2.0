/**
 * CreateClassSheet wizard tests — 3-step flow, no AI suggestions.
 *
 * Flow: Title -> Subject -> Description -> Create.
 * After Create, navigates to the new class quest detail page. Tasks are
 * added there via the existing personalization wizard, which inherits
 * transcript_subject server-side.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: any[]) => mockRouterPush(...args), back: jest.fn(), replace: jest.fn() },
}));

import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { CreateClassSheet } from '../CreateClassSheet';
import api from '@/src/services/api';

describe('CreateClassSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouterPush.mockClear();
  });

  it('blocks Next on empty title', () => {
    const { getByTestId } = render(
      <CreateClassSheet visible={true} onClose={jest.fn()} />
    );
    fireEvent.press(getByTestId('wizard-next-btn'));
    // Still on title step — the input is still rendered.
    expect(getByTestId('class-title-input')).toBeTruthy();
  });

  it('walks Title -> Subject -> Description and shows Create button on the last step', () => {
    const { getByTestId, queryByTestId } = render(
      <CreateClassSheet visible={true} onClose={jest.fn()} />
    );
    fireEvent.changeText(getByTestId('class-title-input'), 'Soccer Conditioning');
    fireEvent.press(getByTestId('wizard-next-btn'));

    // Step 2: subject picker
    fireEvent.press(getByTestId('subject-pe'));
    fireEvent.press(getByTestId('wizard-next-btn'));

    // Step 3: description, Create visible
    expect(getByTestId('class-description-input')).toBeTruthy();
    expect(getByTestId('wizard-create-btn')).toBeTruthy();
    expect(queryByTestId('wizard-next-btn')).toBeNull();
  });

  it('creates an empty class shell and navigates to the detail page', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { quest_id: 'quest-123' } });

    const onCreated = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <CreateClassSheet visible={true} onClose={onClose} onCreated={onCreated} />
    );
    fireEvent.changeText(getByTestId('class-title-input'), 'Soccer');
    fireEvent.press(getByTestId('wizard-next-btn'));
    fireEvent.press(getByTestId('subject-pe'));
    fireEvent.press(getByTestId('wizard-next-btn'));
    fireEvent.changeText(getByTestId('class-description-input'), 'Training for tryouts');

    await act(async () => { fireEvent.press(getByTestId('wizard-create-btn')); });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/quests/create', expect.objectContaining({
        title: 'Soccer',
        description: 'Training for tryouts',
        quest_type: 'class',
        transcript_subject: 'pe',
      }));
      expect(onCreated).toHaveBeenCalledWith('quest-123');
      expect(mockRouterPush).toHaveBeenCalledWith('/(app)/quests/quest-123');
    });

    // Critical: no task-suggestions or add-manual-tasks calls — empty shell.
    const allCalls = (api.post as jest.Mock).mock.calls.map((c) => c[0]);
    expect(allCalls).not.toContain('/api/quests/class-task-suggestions');
    expect(allCalls.find((u) => u.includes('add-manual-tasks'))).toBeUndefined();
  });

  it('omits description when empty', async () => {
    (api.post as jest.Mock).mockResolvedValue({ data: { quest_id: 'quest-xyz' } });

    const { getByTestId } = render(
      <CreateClassSheet visible={true} onClose={jest.fn()} />
    );
    fireEvent.changeText(getByTestId('class-title-input'), 'Reading Mistborn');
    fireEvent.press(getByTestId('wizard-next-btn'));
    fireEvent.press(getByTestId('subject-language_arts'));
    fireEvent.press(getByTestId('wizard-next-btn'));
    // skip description
    await act(async () => { fireEvent.press(getByTestId('wizard-create-btn')); });

    await waitFor(() => {
      const callArgs = (api.post as jest.Mock).mock.calls[0][1];
      expect(callArgs.title).toBe('Reading Mistborn');
      expect(callArgs.transcript_subject).toBe('language_arts');
      expect(callArgs.description).toBeUndefined();
    });
  });
});
