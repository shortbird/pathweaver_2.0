/**
 * "Accepted by <teacher>" on a task, for the family to see.
 *
 * iCreate, ticket 650aa9b9 (2026-09-23): "When I accept a task, the parent is
 * notified of which one, but then it doesn't show up on the task that it has
 * been accepted. Can we show somewhere on the task that I have accepted it, for
 * the parents to see?"
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { TaskReviewChip, reviewChipText } from '../TaskReviewChip';

const REVIEWED_AT = '2026-09-21T18:00:00+00:00';
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

describe('TaskReviewChip', () => {
  it('names the teacher and the date on an accepted task', () => {
    const review = { action: 'accepted', reviewed_at: REVIEWED_AT, reviewer_name: 'Nicole Connole' };
    const { getByText } = render(<TaskReviewChip review={review} />);
    expect(getByText(`Accepted by Nicole Connole · ${shortDate(REVIEWED_AT)}`)).toBeTruthy();
  });

  it('renders nothing when no teacher has reviewed the task', () => {
    expect(render(<TaskReviewChip review={null} />).toJSON()).toBeNull();
  });

  it('renders nothing for a payload that predates the review field', () => {
    expect(render(<TaskReviewChip />).toJSON()).toBeNull();
  });

  it('says "your teacher" when the reviewer has no name on file, and drops a missing date', () => {
    expect(reviewChipText({ action: 'accepted', reviewed_at: null, reviewer_name: null }))
      .toBe('Accepted by your teacher');
  });

  it('only an accept reads as accepted', () => {
    expect(reviewChipText({ action: 'returned', reviewed_at: REVIEWED_AT, reviewer_name: 'N' })).toBeNull();
  });
});
