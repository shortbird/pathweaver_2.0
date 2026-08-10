/**
 * SchoolCommunity + CarpoolBoard — sections render only when the school has
 * used them, and the carpool affordances follow canPost/mine/canModerate.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SchoolCommunity from '../SchoolCommunity';
import CarpoolBoard from '../CarpoolBoard';
import type { SchoolFeed, CarpoolPost } from '@/src/hooks/useSchool';

const emptyFeed: SchoolFeed = {
  announcements: [], events: [], lost_found: [], recognition: [], carpool: [],
};

describe('SchoolCommunity', () => {
  it('renders nothing for a null feed', () => {
    const { toJSON } = render(<SchoolCommunity feed={null} />);
    expect(toJSON()).toBeNull();
  });

  it('renders only the sections that have content', () => {
    const feed: SchoolFeed = {
      ...emptyFeed,
      announcements: [{ id: 'a1', title: 'Picture day', body: '<p>Wear <strong>bright</strong> colors</p>', pinned: true, priority: 'urgent', created_at: '2026-08-01T00:00:00Z' }],
      recognition: [{ id: 'r1', type: 'weekly_win', recipient_name: 'Jane B.', message: 'Finished her mural', created_at: '2026-08-02T00:00:00Z' }],
    };
    const { getByText, queryByText } = render(<SchoolCommunity feed={feed} />);

    expect(getByText('Announcements')).toBeTruthy();
    expect(getByText('Picture day')).toBeTruthy();
    expect(getByText('Pinned')).toBeTruthy();
    expect(getByText('Urgent')).toBeTruthy();
    // Rich body rendered as native text, not raw markup.
    expect(getByText(/Wear/)).toBeTruthy();
    expect(queryByText(/<p>/)).toBeNull();

    expect(getByText('Shout-outs')).toBeTruthy();
    expect(getByText('Win of the week')).toBeTruthy();
    expect(getByText('Jane B.')).toBeTruthy();

    expect(queryByText('Upcoming events')).toBeNull();
    expect(queryByText(/Lost & found/)).toBeNull();
  });

  it('each section collapses and expands on a header tap', () => {
    const feed: SchoolFeed = {
      ...emptyFeed,
      announcements: [{ id: 'a1', title: 'Picture day', body: null, pinned: false, priority: 'normal', created_at: '2026-08-01T00:00:00Z' }],
      events: [{ id: 'e1', title: 'Open house', description: null, location: null, start_at: '2026-08-20T16:00:00Z', end_at: null, all_day: false }],
    };
    const { getByTestId, getByText, queryByText } = render(<SchoolCommunity feed={feed} />);

    expect(getByText('Picture day')).toBeTruthy();
    fireEvent.press(getByTestId('section-toggle-Announcements'));
    expect(queryByText('Picture day')).toBeNull();
    // Only that section collapsed — the next one keeps its content.
    expect(getByText('Open house')).toBeTruthy();

    fireEvent.press(getByTestId('section-toggle-Announcements'));
    expect(getByText('Picture day')).toBeTruthy();
  });

  it('shows the donation countdown on lost & found items', () => {
    const feed: SchoolFeed = {
      ...emptyFeed,
      lost_found: [{
        id: 'l1', description: 'Blue water bottle', image_url: null, category: 'Bottles',
        date_found: '2026-08-01', location_found: 'Studio B', created_at: '2026-08-01T00:00:00Z',
        days_until_donation: 3,
      }],
    };
    const { getByText } = render(<SchoolCommunity feed={feed} />);
    expect(getByText('Donated in 3 days')).toBeTruthy();
  });
});

describe('CarpoolBoard', () => {
  const post = (over: Partial<CarpoolPost> = {}): CarpoolPost => ({
    id: 'c1', type: 'offer', message: 'Two seats from Provo', area: 'Provo', days: 'MWF',
    author_name: 'Dana P.', created_at: '2026-08-01T00:00:00Z', mine: false, ...over,
  });
  const noop = async () => {};

  it('renders nothing for a student with an empty board', () => {
    const { toJSON } = render(
      <CarpoolBoard posts={[]} canPost={false} canModerate={false} onPost={noop} onRemove={noop} onMessage={noop} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('students see posts but no composer or message buttons', () => {
    const { getByText, queryByTestId } = render(
      <CarpoolBoard posts={[post()]} canPost={false} canModerate={false} onPost={noop} onRemove={noop} onMessage={noop} />,
    );
    expect(getByText('Two seats from Provo')).toBeTruthy();
    expect(queryByTestId('carpool-open-composer')).toBeNull();
    expect(queryByTestId('carpool-message-c1')).toBeNull();
  });

  it('a parent can message another family\'s post but not their own', () => {
    const { queryByTestId } = render(
      <CarpoolBoard
        posts={[post(), post({ id: 'c2', mine: true })]}
        canPost canModerate={false} onPost={noop} onRemove={noop} onMessage={noop}
      />,
    );
    expect(queryByTestId('carpool-message-c1')).toBeTruthy();
    expect(queryByTestId('carpool-message-c2')).toBeNull();
    // Own post is removable; someone else's is not (no moderation).
    expect(queryByTestId('carpool-remove-c2')).toBeTruthy();
    expect(queryByTestId('carpool-remove-c1')).toBeNull();
  });

  it('a moderator can remove any post', () => {
    const { queryByTestId } = render(
      <CarpoolBoard posts={[post()]} canPost canModerate onPost={noop} onRemove={noop} onMessage={noop} />,
    );
    expect(queryByTestId('carpool-remove-c1')).toBeTruthy();
  });

  it('sends a first-contact message through onMessage', async () => {
    const onMessage = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <CarpoolBoard posts={[post()]} canPost canModerate={false} onPost={noop} onRemove={noop} onMessage={onMessage} />,
    );
    fireEvent.press(getByTestId('carpool-message-c1'));
    fireEvent.changeText(getByTestId('carpool-dm-input'), 'Is the Tuesday seat open?');
    fireEvent.press(getByTestId('carpool-dm-send'));
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith('c1', 'Is the Tuesday seat open?'));
  });

  it('posts through onPost with the composed form', async () => {
    const onPost = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <CarpoolBoard posts={[]} canPost canModerate={false} onPost={onPost} onRemove={noop} onMessage={noop} />,
    );
    fireEvent.press(getByTestId('carpool-open-composer'));
    fireEvent.press(getByTestId('carpool-type-need'));
    fireEvent.changeText(getByTestId('carpool-message-input'), 'Need a ride on studio days');
    fireEvent.press(getByTestId('carpool-submit'));
    await waitFor(() => expect(onPost).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'need', message: 'Need a ride on studio days' }),
    ));
  });
});
