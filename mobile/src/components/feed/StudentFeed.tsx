/**
 * StudentFeed - the signed-in learner's own feed: their completions and
 * moments, their friends' work, and their friends themselves (FriendsStrip,
 * with Add first in the row, since 2026-09-18; before that a "Friends" pill
 * sat beside the subtitle, off the edge of a phone, and said nothing about
 * how to get one). Once the student has a friend, a segment bar filters
 * whose work shows: All, Mine, Friends (2026-09-16; the server's `scope`,
 * so a page of Friends is a page of friends' items). A superadmin gets
 * Highlights instead, which flips the source to the curated reel.
 */

import React, { useState, useMemo } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFeed } from '@/src/hooks/useFeed';
import { useFriends } from '@/src/hooks/useFriends';
import { useAuthStore } from '@/src/stores/authStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { Heading, UIText } from '@/src/components/ui';
import { FeedList, FeedLoading, SegmentBar } from './FeedList';
import { FriendsStrip } from './FriendsStrip';

type Segment = 'feed' | 'highlights';
type Scope = 'all' | 'self' | 'friends';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'highlights', label: 'Highlights' },
];

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'self', label: 'Mine' },
  { key: 'friends', label: 'Friends' },
];

export function StudentFeed({ isDesktop }: { isDesktop: boolean }) {
  const c = useThemeColors();
  const isSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin';
  const [segment, setSegment] = useState<Segment>('feed');
  const [scope, setScope] = useState<Scope>('all');
  const feed = useFeed({ highlightsOnly: segment === 'highlights', scope: scope === 'all' ? undefined : scope });
  // The friends themselves (the strip), and whether there is anyone to
  // filter by. Not a tab: the bar is full, and a friend's WORK already
  // arrives in this feed. Students only; a parent works a child's friends
  // from the Family tab.
  const friends = useFriends();
  const hasFriends = friends.connections.active.length > 0;

  const header = useMemo(() => (
    <>
      <View className={`pt-2 md:pt-6 pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        {isDesktop && <Heading size="xl">Feed</Heading>}
        <UIText size="sm" className="text-typo-500 mt-1 dark:text-dark-typo-500">
          Recent completions and learning moments
        </UIText>
      </View>
      <FriendsStrip
        eligibility={friends.eligibility}
        connections={friends.connections}
        loading={friends.loading}
        isDesktop={isDesktop}
      />
      {isSuperadmin ? (
        <SegmentBar
          segments={SEGMENTS}
          value={segment}
          onChange={setSegment}
          isDesktop={isDesktop}
          icon={(key, active) => key === 'highlights'
            ? <Ionicons name={active ? 'star' : 'star-outline'} size={14} color={active ? '#FF9028' : c.iconMuted} />
            : null}
        />
      ) : hasFriends ? (
        <SegmentBar segments={SCOPES} value={scope} onChange={setScope} isDesktop={isDesktop} />
      ) : null}
    </>
  ), [isDesktop, isSuperadmin, segment, scope, hasFriends, friends.eligibility, friends.connections, friends.loading, c.iconMuted]);

  if (feed.loading && feed.items.length === 0) return <FeedLoading />;

  return (
    <FeedList
      {...feed}
      isDesktop={isDesktop}
      header={header}
      emptyText={scope === 'friends'
        ? 'When a friend finishes a task or captures a learning moment, it shows here.'
        : 'Complete tasks and capture learning moments to build your feed.'}
    />
  );
}
