/**
 * EditMomentModal tests - editing learning moments with title, description,
 * pillars, date, topic assignment, and AI suggestions.
 */

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

jest.mock('@/src/hooks/useJournal', () => ({
  ...jest.requireActual('@/src/hooks/useJournal'),
  updateLearningEvent: jest.fn(),
  getAiSuggestions: jest.fn(),
  assignMomentToTopic: jest.fn(),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { EditMomentModal } from '../EditMomentModal';
import { updateLearningEvent, getAiSuggestions, assignMomentToTopic } from '@/src/hooks/useJournal';
import { createMockLearningEvent, createMockTopic } from '@/src/__tests__/utils/mockFactories';

const mockOnClose = jest.fn();
const mockOnSaved = jest.fn();

const baseEvent = createMockLearningEvent({
  id: 'evt-1',
  title: 'Plant Growth',
  description: 'Observed how plants grow under different light conditions',
  pillars: ['stem'],
  event_date: '2026-03-20',
  topics: [{ type: 'topic', id: 'topic-1', name: 'Science Projects' }],
});

const topics = [
  createMockTopic({ id: 'topic-1', name: 'Science Projects', type: 'topic', color: '#2469D1' }),
  createMockTopic({ id: 'topic-2', name: 'Art Portfolio', type: 'topic', color: '#AF56E5' }),
];

beforeEach(() => {
  jest.clearAllMocks();
  (updateLearningEvent as jest.Mock).mockResolvedValue({ success: true });
  (assignMomentToTopic as jest.Mock).mockResolvedValue({ success: true });
});

describe('EditMomentModal', () => {
  it('renders with event data pre-filled', () => {
    const { getByDisplayValue, getByText } = render(
      <EditMomentModal visible={true} event={baseEvent} topics={topics} onClose={mockOnClose} onSaved={mockOnSaved} />
    );

    expect(getByDisplayValue('Plant Growth')).toBeTruthy();
    expect(getByDisplayValue('Observed how plants grow under different light conditions')).toBeTruthy();
    expect(getByText('Save Changes')).toBeTruthy();
    expect(getByText('Edit Moment')).toBeTruthy();
  });

  it('shows pillar selection with pre-selected pillars', () => {
    const { getByText } = render(
      <EditMomentModal visible={true} event={baseEvent} topics={topics} onClose={mockOnClose} onSaved={mockOnSaved} />
    );

    // All 5 pillars should be visible
    expect(getByText('STEM')).toBeTruthy();
    expect(getByText('Art')).toBeTruthy();
    expect(getByText('Communication')).toBeTruthy();
    expect(getByText('Civics')).toBeTruthy();
    expect(getByText('Wellness')).toBeTruthy();
  });

  it('saves updated title and description', async () => {
    const { getByDisplayValue, getByText } = render(
      <EditMomentModal visible={true} event={baseEvent} topics={topics} onClose={mockOnClose} onSaved={mockOnSaved} />
    );

    fireEvent.changeText(getByDisplayValue('Plant Growth'), 'Updated Title');
    fireEvent.changeText(
      getByDisplayValue('Observed how plants grow under different light conditions'),
      'Updated description'
    );
    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => {
      expect(updateLearningEvent).toHaveBeenCalledWith('evt-1', expect.objectContaining({
        title: 'Updated Title',
        description: 'Updated description',
      }));
      expect(mockOnSaved).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('AI suggestions button requests suggestions and applies them', async () => {
    const eventNoTitle = createMockLearningEvent({
      id: 'evt-2',
      title: '',
      description: 'I built a small robot that follows a line using sensors and Arduino',
      pillars: [],
    });

    (getAiSuggestions as jest.Mock).mockResolvedValueOnce({
      success: true,
      suggestions: {
        title: 'Line-Following Robot Build',
        pillars: ['stem'],
      },
    });

    const { getByText } = render(
      <EditMomentModal visible={true} event={eventNoTitle} topics={topics} onClose={mockOnClose} onSaved={mockOnSaved} />
    );

    fireEvent.press(getByText('AI suggest title & pillars'));

    await waitFor(() => {
      expect(getAiSuggestions).toHaveBeenCalledWith(
        'I built a small robot that follows a line using sensors and Arduino'
      );
    });

    await waitFor(() => {
      expect(getByText('Suggestions applied')).toBeTruthy();
    });
  });

  it('topic picker shows available topics and allows changing assignment', async () => {
    const { getByText } = render(
      <EditMomentModal visible={true} event={baseEvent} topics={topics} onClose={mockOnClose} onSaved={mockOnSaved} />
    );

    // Current topic should be shown
    expect(getByText('Science Projects')).toBeTruthy();

    // Open topic picker
    fireEvent.press(getByText('Science Projects'));

    // Should see both topics + Unassigned option
    await waitFor(() => {
      expect(getByText('Unassigned')).toBeTruthy();
      expect(getByText('Art Portfolio')).toBeTruthy();
    });

    // Select new topic
    fireEvent.press(getByText('Art Portfolio'));

    // Save
    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => {
      // Should remove old topic and add new one
      expect(assignMomentToTopic).toHaveBeenCalledWith('evt-1', 'track', 'topic-1', 'remove');
      expect(assignMomentToTopic).toHaveBeenCalledWith('evt-1', 'track', 'topic-2', 'add');
    });
  });

  it('sends full current state on save even when no fields changed', async () => {
    const { getByText } = render(
      <EditMomentModal visible={true} event={baseEvent} topics={topics} onClose={mockOnClose} onSaved={mockOnSaved} />
    );

    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => {
      expect(updateLearningEvent).toHaveBeenCalledWith('evt-1', expect.objectContaining({
        description: 'Observed how plants grow under different light conditions',
        pillars: ['stem'],
      }));
      expect(assignMomentToTopic).not.toHaveBeenCalled();
      expect(mockOnSaved).toHaveBeenCalled();
    });
  });

  it('returns null when event is null', () => {
    const { toJSON } = render(
      <EditMomentModal visible={true} event={null} topics={topics} onClose={mockOnClose} onSaved={mockOnSaved} />
    );

    expect(toJSON()).toBeNull();
  });
});
