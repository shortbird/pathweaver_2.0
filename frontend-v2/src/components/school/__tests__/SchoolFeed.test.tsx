/**
 * SchoolFeed (the unified stream) + CarpoolBoard.
 *
 * The feed is OPEN — it is the page (2026-08-23 redesign), so its items are
 * asserted directly. The carpool board keeps the closed-on-arrival section
 * default on the hub, so its tests open it first via `open()`.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import SchoolFeed, { ComingUp, mergeSchoolFeed } from '../SchoolFeed';
import CarpoolBoard from '../CarpoolBoard';
import type { SchoolFeed as SchoolFeedData, CarpoolPost, ArchivedMessage } from '@/src/hooks/useSchool';

const emptyFeed: SchoolFeedData = {
  announcements: [], events: [], lost_found: [], recognition: [], carpool: [],
};

const board = (over: any = {}) => ({
  id: 'a1', title: 'Picture day', body: '<p>Wear <strong>bright</strong> colors</p>',
  pinned: false, priority: 'normal', created_at: '2026-08-05T00:00:00Z', ...over,
});
const message = (over: Partial<ArchivedMessage> = {}): ArchivedMessage => ({
  id: 'm1', title: 'Fall Newsletter', content: 'Welcome back.', message: 'Welcome back.',
  created_at: '2026-08-03T00:00:00Z', ...over,
});

/** Expand a collapsed section by its title. */
const open = (getByTestId: any, title: string) =>
  fireEvent.press(getByTestId(`section-toggle-${title}`));

describe('mergeSchoolFeed', () => {
  it('interleaves board posts, messages, shout-outs and lost & found by date', () => {
    const feed: SchoolFeedData = {
      ...emptyFeed,
      announcements: [board()],
      recognition: [{ id: 'r1', type: 'weekly_win', recipient_name: 'Jane B.', message: 'Mural', created_at: '2026-08-04T00:00:00Z' }],
      lost_found: [{ id: 'l1', description: 'Bottle', image_url: null, category: null, date_found: null, location_found: null, created_at: '2026-08-02T00:00:00Z' }],
    };
    const keys = mergeSchoolFeed(feed, [message()]).map((i) => i.key);
    expect(keys).toEqual(['announcement-a1', 'shoutout-r1', 'message-m1', 'lostfound-l1']);
  });

  it('puts pinned board posts first even when older', () => {
    const feed: SchoolFeedData = {
      ...emptyFeed,
      announcements: [board({ id: 'a-old', pinned: true, created_at: '2026-07-01T00:00:00Z' })],
    };
    const keys = mergeSchoolFeed(feed, [message()]).map((i) => i.key);
    expect(keys).toEqual(['announcement-a-old', 'message-m1']);
  });

  it('drops the archive copy of a board post (same title, same day)', () => {
    // A board post created with "notify" also writes an archive row — the
    // same words twice. The board copy wins; it carries pinned/urgent.
    const feed: SchoolFeedData = { ...emptyFeed, announcements: [board()] };
    const dup = message({ id: 'm-dup', title: 'Picture day', created_at: '2026-08-05T15:00:00Z' });
    const items = mergeSchoolFeed(feed, [dup, message()]);
    expect(items.map((i) => i.key)).toEqual(['announcement-a1', 'message-m1']);
  });
});

describe('SchoolFeed', () => {
  it('renders nothing when the school has said nothing', () => {
    const { toJSON } = render(
      <SchoolFeed schoolName="iCreate" feed={null} messages={[]} onSeeAll={() => {}} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('shows board posts and sent messages in one open stream — no tap needed', () => {
    const feed: SchoolFeedData = {
      ...emptyFeed,
      announcements: [board({ pinned: true, priority: 'urgent' })],
      recognition: [{ id: 'r1', type: 'weekly_win', recipient_name: 'Jane B.', message: 'Finished her mural', created_at: '2026-08-02T00:00:00Z' }],
    };
    const { getByText, queryByText, getByTestId } = render(
      <SchoolFeed schoolName="iCreate" feed={feed} messages={[message()]} onSeeAll={() => {}} />,
    );
    // The heading is the section's own toggle now, so it is one accessibility
    // node rather than loose text. Open on arrival, so the items below it still
    // render without a tap.
    expect(getByTestId('section-toggle-From iCreate')).toBeTruthy();
    expect(getByText('Picture day')).toBeTruthy();
    expect(getByText('Pinned')).toBeTruthy();
    expect(getByText('Urgent')).toBeTruthy();
    expect(getByText('Fall Newsletter')).toBeTruthy();
    expect(getByText('Win of the week')).toBeTruthy();
    expect(getByText('Jane B.')).toBeTruthy();
    // Rich body rendered as native text, not raw markup.
    expect(getByText(/Wear/)).toBeTruthy();
    expect(queryByText(/<p>/)).toBeNull();
  });

  it('shows the donation countdown on lost & found items', () => {
    const feed: SchoolFeedData = {
      ...emptyFeed,
      lost_found: [{
        id: 'l1', description: 'Blue water bottle', image_url: null, category: 'Bottles',
        date_found: '2026-08-01', location_found: 'Studio B', created_at: '2026-08-01T00:00:00Z',
        days_until_donation: 3,
      }],
    };
    const { getByText } = render(
      <SchoolFeed schoolName="iCreate" feed={feed} messages={[]} onSeeAll={() => {}} />,
    );
    expect(getByText('Blue water bottle')).toBeTruthy();
    expect(getByText('Donated in 3 days')).toBeTruthy();
  });

  it('caps the stream and expands on Show all', () => {
    const messages = Array.from({ length: 8 }, (_, i) => message({
      id: `m${i}`, title: `Message ${i}`, created_at: `2026-08-0${(i % 7) + 1}T00:00:00Z`,
    }));
    const { getByTestId, getByText, queryByText } = render(
      <SchoolFeed schoolName="iCreate" feed={emptyFeed} messages={messages} onSeeAll={() => {}} />,
    );
    expect(getByText('Show all 8')).toBeTruthy();
    // Three visible, five waiting: six posts was most of a phone screen before
    // anything else on the page got a look in.
    const shown = messages.filter((m) => queryByText(m.title as string)).length;
    expect(shown).toBe(3);
    fireEvent.press(getByTestId('feed-show-all'));
    expect(messages.filter((m) => queryByText(m.title as string)).length).toBe(8);
  });

  it('offers the archive for older messages and search', () => {
    const onSeeAll = jest.fn();
    const { getByTestId } = render(
      <SchoolFeed schoolName="iCreate" feed={emptyFeed} messages={[message()]} onSeeAll={onSeeAll} />,
    );
    fireEvent.press(getByTestId('feed-see-all'));
    expect(onSeeAll).toHaveBeenCalled();
  });
});

describe('ComingUp', () => {
  it('renders nothing without events', () => {
    const { toJSON } = render(<ComingUp events={[]} />);
    expect(toJSON()).toBeNull();
  });

  it('shows the next dates without a tap', () => {
    const { getByText } = render(
      <ComingUp events={[
        { id: 'e1', title: 'Open house', description: null, location: 'Main hall', start_at: '2026-08-20T16:00:00Z', end_at: null, all_day: false },
      ]} />,
    );
    expect(getByText('Coming up')).toBeTruthy();
    expect(getByText('Open house')).toBeTruthy();
    expect(getByText('Main hall')).toBeTruthy();
  });
});

describe('CarpoolBoard', () => {
  const post = (over: Partial<CarpoolPost> = {}): CarpoolPost => ({
    id: 'c1', type: 'offer', message: 'Two seats from Provo', area: 'Provo', days: 'MWF',
    author_name: 'Dana P.', author_id: 'u-dana', created_at: '2026-08-01T00:00:00Z',
    mine: false, ...over,
  });
  const noop = async () => {};

  it('renders nothing for a student with an empty board', () => {
    const { toJSON } = render(
      <CarpoolBoard posts={[]} canPost={false} canModerate={false} onPost={noop} onRemove={noop} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('opens on arrival when the dedicated screen asks it to', () => {
    const { getByText } = render(
      <CarpoolBoard posts={[post()]} canPost={false} canModerate={false} onPost={noop} onRemove={noop} defaultOpen />,
    );
    expect(getByText('Two seats from Provo')).toBeTruthy();
  });

  it('students see posts but no composer or message buttons', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <CarpoolBoard posts={[post()]} canPost={false} canModerate={false} onPost={noop} onRemove={noop} />,
    );
    open(getByTestId, 'Carpool board');
    expect(getByText('Two seats from Provo')).toBeTruthy();
    expect(queryByTestId('carpool-open-composer')).toBeNull();
    expect(queryByTestId('carpool-message-c1')).toBeNull();
  });

  it('a parent can message another family\'s post but not their own', () => {
    const { getByTestId, queryByTestId } = render(
      <CarpoolBoard
        posts={[post(), post({ id: 'c2', mine: true })]}
        canPost canModerate={false} onPost={noop} onRemove={noop}
      />,
    );
    open(getByTestId, 'Carpool board');
    expect(queryByTestId('carpool-message-c1')).toBeTruthy();
    expect(queryByTestId('carpool-message-c2')).toBeNull();
    // Own post is removable; someone else's is not (no moderation).
    expect(queryByTestId('carpool-remove-c2')).toBeTruthy();
    expect(queryByTestId('carpool-remove-c1')).toBeNull();
  });

  it('a moderator can remove any post', () => {
    const { getByTestId, queryByTestId } = render(
      <CarpoolBoard posts={[post()]} canPost canModerate onPost={noop} onRemove={noop} />,
    );
    open(getByTestId, 'Carpool board');
    expect(queryByTestId('carpool-remove-c1')).toBeTruthy();
  });

  it('opens the author\'s thread in Messages instead of composing here', () => {
    const { getByTestId } = render(
      <CarpoolBoard posts={[post()]} canPost canModerate={false} onPost={noop} onRemove={noop} />,
    );
    open(getByTestId, 'Carpool board');
    fireEvent.press(getByTestId('carpool-message-c1'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(app)/(tabs)/messages', params: { user: 'u-dana' },
    });
  });

  it('offers no way to message a post whose author the feed did not name', () => {
    const { getByTestId, queryByTestId } = render(
      <CarpoolBoard posts={[post({ author_id: null })]} canPost canModerate={false}
        onPost={noop} onRemove={noop} />,
    );
    open(getByTestId, 'Carpool board');
    expect(queryByTestId('carpool-message-c1')).toBeNull();
  });

  it('posts through onPost with the composed form', async () => {
    const onPost = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <CarpoolBoard posts={[]} canPost canModerate={false} onPost={onPost} onRemove={noop} />,
    );
    open(getByTestId, 'Carpool board');
    fireEvent.press(getByTestId('carpool-open-composer'));
    fireEvent.press(getByTestId('carpool-type-need'));
    fireEvent.changeText(getByTestId('carpool-message-input'), 'Need a ride on studio days');
    fireEvent.press(getByTestId('carpool-submit'));
    await waitFor(() => expect(onPost).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'need', message: 'Need a ride on studio days' }),
    ));
  });
});
