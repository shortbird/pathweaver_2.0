/**
 * Unread teacher feedback on the quest screen.
 *
 * Horizon, ticket 4ea811d6 (2026-10-07): "Teacher feedback lands in chat or
 * the inbox with a small badge, and students miss it. A banner or pop-up
 * attached to the quest itself would make sure they see it."
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { TeacherFeedbackBanner, NewFeedbackMarker, feedbackBannerTitle } from '../TeacherFeedbackBanner';
import { TaskFeedbackThread } from '../TaskFeedbackThread';
import api from '@/src/services/api';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

const feedback = {
  task_id: 't1', task_title: 'Sketch the cone', completion_id: 'comp-1',
  author_name: 'Dallin Bird', preview: 'Label the magma chamber.',
};

describe('TeacherFeedbackBanner', () => {
  it('names the task and shows the note when feedback is unread', () => {
    const r = render(<TeacherFeedbackBanner count={1} feedback={feedback} />);
    expect(r.getByTestId('teacher-feedback-banner')).toBeTruthy();
    expect(r.getByText('Your teacher left feedback on Sketch the cone')).toBeTruthy();
    expect(r.getByText('Dallin Bird: Label the magma chamber.')).toBeTruthy();
    expect(r.getByText('Read feedback')).toBeTruthy();
  });

  it('says how many more notes are waiting', () => {
    const r = render(<TeacherFeedbackBanner count={3} feedback={feedback} />);
    expect(r.getByText('2 more new notes on this quest')).toBeTruthy();
  });

  it('renders nothing at a count of 0', () => {
    expect(render(<TeacherFeedbackBanner count={0} feedback={feedback} />).toJSON()).toBeNull();
  });

  it('renders nothing on a payload that predates the field', () => {
    expect(render(<TeacherFeedbackBanner />).toJSON()).toBeNull();
  });

  it('Read feedback hands the note to the screen', () => {
    const onRead = jest.fn();
    const r = render(<TeacherFeedbackBanner count={1} feedback={feedback} onRead={onRead} />);
    fireEvent.press(r.getByText('Read feedback'));
    expect(onRead).toHaveBeenCalledWith(feedback);
  });

  it('falls back to "a task" without a title', () => {
    expect(feedbackBannerTitle({ ...feedback, task_title: null })).toBe('Your teacher left feedback on a task');
  });
});

describe('NewFeedbackMarker', () => {
  it('shows at a count above 0 and not at 0', () => {
    expect(render(<NewFeedbackMarker count={2} />).getByText('New feedback')).toBeTruthy();
    expect(render(<NewFeedbackMarker count={0} />).toJSON()).toBeNull();
  });
});

describe('TaskFeedbackThread', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (api.get as jest.Mock).mockResolvedValue({ data: { success: true, messages: [
      { id: 'm1', author_name: 'Dallin Bird', body: 'Label the vent.', is_mine: false },
    ] } });
    (api.post as jest.Mock).mockResolvedValue({ data: { success: true, marked: 1 } });
  });

  it('shows the teacher note and marks it read once loaded', async () => {
    const onRead = jest.fn();
    const r = render(<TaskFeedbackThread completionId="comp-1" markRead onRead={onRead} />);
    expect(await r.findByText('Label the vent.')).toBeTruthy();
    await waitFor(() => expect(onRead).toHaveBeenCalledWith('comp-1'));
    expect(api.post).toHaveBeenCalledWith('/api/credit/comp-1/messages/read', {});
  });

  it('marks nothing read without markRead', async () => {
    const r = render(<TaskFeedbackThread completionId="comp-1" />);
    expect(await r.findByText('Label the vent.')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sends a reply to the thread', async () => {
    const r = render(<TaskFeedbackThread completionId="comp-1" />);
    await r.findByText('Label the vent.');
    fireEvent.changeText(r.getByLabelText('Write a reply'), 'Done, thanks');
    fireEvent.press(r.getByText('Send'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/api/credit/comp-1/messages', { body: 'Done, thanks' }));
  });
});
