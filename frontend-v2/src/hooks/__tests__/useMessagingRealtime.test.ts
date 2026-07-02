/**
 * useMessagingRealtime tests - broadcast subscription lifecycle + the pure
 * state-patching helpers shared by ChatWindow/GroupChatWindow.
 */

jest.mock('@/src/services/supabaseClient', () => {
  const listeners: Record<string, (arg: any) => void> = {};
  const channel: any = {
    on: jest.fn((_type: string, filter: any, cb: any) => {
      listeners[filter.event] = cb;
      return channel;
    }),
    subscribe: jest.fn(() => channel),
  };
  const supabase = {
    channel: jest.fn(() => channel),
    removeChannel: jest.fn(),
  };
  return { __esModule: true, supabase, default: supabase, __mock: { listeners, channel, supabase } };
});

import { renderHook, act } from '@testing-library/react-native';
import {
  useMessagingRealtime,
  appendRealtimeMessage,
  patchMessageReactions,
  patchMessageEdited,
  patchMessageDeleted,
} from '../useMessagingRealtime';
import type { Message } from '../useMessages';
import * as supabaseClientModule from '@/src/services/supabaseClient';

const { listeners, channel, supabase } = (supabaseClientModule as any).__mock;

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  sender_id: 'user-1',
  message_content: 'Hello',
  created_at: '2026-07-01T00:00:00Z',
  read_at: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(listeners).forEach((k) => delete listeners[k]);
});

describe('useMessagingRealtime', () => {
  it('subscribes to the topic and registers all broadcast events', () => {
    renderHook(() => useMessagingRealtime('dm:conv-1', {}));

    expect(supabase.channel).toHaveBeenCalledWith('dm:conv-1');
    expect(channel.subscribe).toHaveBeenCalled();
    expect(Object.keys(listeners).sort()).toEqual(
      ['deleted', 'edited', 'message', 'pinned', 'reactions', 'settings'],
    );
  });

  it('does not subscribe when topic is null', () => {
    renderHook(() => useMessagingRealtime(null, {}));

    expect(supabase.channel).not.toHaveBeenCalled();
  });

  it('delivers broadcast payloads to the latest handlers', () => {
    const onMessage = jest.fn();
    const onReactions = jest.fn();
    const onSettings = jest.fn();
    renderHook(() => useMessagingRealtime('group:g-1', { onMessage, onReactions, onSettings }));

    const msg = makeMessage({ id: 'gmsg-9', group_id: 'g-1' });
    act(() => {
      listeners.message({ payload: msg });
      listeners.reactions({ payload: { message_id: 'gmsg-9', reactions: [{ emoji: '👍', count: 1, reacted: false }] } });
      listeners.settings({ payload: { announcement_only: true } });
    });

    expect(onMessage).toHaveBeenCalledWith(msg);
    expect(onReactions).toHaveBeenCalledWith(
      expect.objectContaining({ message_id: 'gmsg-9' }),
    );
    expect(onSettings).toHaveBeenCalledWith({ announcement_only: true });
  });

  it('removes the channel on unmount', () => {
    const { unmount } = renderHook(() => useMessagingRealtime('dm:conv-1', {}));

    unmount();

    expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('re-subscribes when the topic changes', () => {
    const { rerender } = renderHook(
      ({ topic }: { topic: string | null }) => useMessagingRealtime(topic, {}),
      { initialProps: { topic: 'dm:conv-1' } },
    );

    rerender({ topic: 'dm:conv-2' });

    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(supabase.channel).toHaveBeenCalledWith('dm:conv-2');
  });
});

describe('appendRealtimeMessage', () => {
  it('appends a new message', () => {
    const prev = [makeMessage()];
    const incoming = makeMessage({ id: 'msg-2', message_content: 'Second' });

    const next = appendRealtimeMessage(prev, incoming);

    expect(next).toHaveLength(2);
    expect(next[1].id).toBe('msg-2');
  });

  it('dedupes messages already in state', () => {
    const prev = [makeMessage()];

    expect(appendRealtimeMessage(prev, makeMessage())).toBe(prev);
  });

  it('replaces a matching optimistic bubble instead of duplicating', () => {
    const optimistic = makeMessage({ id: 'temp-1', isOptimistic: true });
    const saved = makeMessage({ id: 'msg-real' });

    const next = appendRealtimeMessage([optimistic], saved);

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('msg-real');
    expect(next[0].isOptimistic).toBe(false);
  });
});

describe('patch helpers', () => {
  it('patchMessageReactions swaps the reactions for the target message', () => {
    const prev = [makeMessage(), makeMessage({ id: 'msg-2' })];
    const reactions = [{ emoji: '❤️', count: 3, reacted: true }];

    const next = patchMessageReactions(prev, 'msg-2', reactions);

    expect(next[0].reactions).toBeUndefined();
    expect(next[1].reactions).toEqual(reactions);
  });

  it('patchMessageEdited updates content and edited_at', () => {
    const next = patchMessageEdited([makeMessage()], {
      message_id: 'msg-1', content: 'Edited!', edited_at: '2026-07-01T01:00:00Z',
    });

    expect(next[0].message_content).toBe('Edited!');
    expect(next[0].edited_at).toBe('2026-07-01T01:00:00Z');
  });

  it('patchMessageDeleted blanks content and marks the tombstone', () => {
    const next = patchMessageDeleted(
      [makeMessage({ attachments: [{ url: 'https://x/a.jpg', type: 'image', name: 'a', size: 1 }] })],
      'msg-1',
    );

    expect(next[0].is_deleted).toBe(true);
    expect(next[0].message_content).toBe('');
    expect(next[0].attachments).toEqual([]);
  });
});
