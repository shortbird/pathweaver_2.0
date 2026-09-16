/**
 * StudentFeed - the signed-in learner's own feed: their completions and
 * moments, their friends' work, and the door to Friends. Once the student
 * has a friend, a segment bar filters whose work shows: All, Mine, Friends
 * (2026-09-16; the server's `scope`, so a page of Friends is a page of
 * friends' items). A superadmin gets Highlights instead, which flips the
 * source to the curated reel.
 */

import React, { useState, useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFeed } from '@/src/hooks/useFeed';
import { useFriends } from '@/src/hooks/useFriends';
import { useAuthStore } from '@/src/stores/authStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { VStack, HStack, Heading, UIText } from '@/src/components/ui';
import { FeedList, FeedLoading, SegmentBar } from './FeedList';

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
  // The friends list: whether there is anyone to filter by, and how many
  // requests wait on the student (the badge on the Friends button).
  const { connections } = useFriends();
  const hasFriends = connections.active.length > 0;
  const waiting = connections.incoming.length;

  const header = useMemo(() => (
    <>
      <View className={`pt-2 md:pt-6 pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        <HStack className="items-center justify-between">
          <VStack>
            {isDesktop && <Heading size="xl">Feed</Heading>}
            <UIText size="sm" className="text-typo-500 mt-1 dark:text-dark-typo-500">
              Recent completions and learning moments
            </UIText>
          </VStack>
          {/* Friends (2026-09-16). Not a sixth tab: the bar is full, and a
              friend's WORK already arrives in this feed. This is where the
              friendships are managed. Students only; a parent works a
              child's friends from the Family tab. */}
          <Pressable
            onPress={() => router.push('/(app)/friends' as any)}
            accessibilityRole="button"
            accessibilityLabel="Friends"
            testID="feed-friends-button"
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-optio-purple/10 active:bg-optio-purple/20"
          >
            <Ionicons name="people-outline" size={16} color={c.brand} />
            <UIText size="xs" className="text-optio-purple font-poppins-medium">Friends</UIText>
            {waiting > 0 && (
              <View className="rounded-full bg-optio-pink px-1.5 min-w-[18px] items-center" testID="feed-friends-badge">
                <UIText size="xs" className="text-white font-poppins-bold">{waiting}</UIText>
              </View>
            )}
          </Pressable>
        </HStack>
      </View>
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
  ), [isDesktop, isSuperadmin, segment, scope, hasFriends, waiting, c.brand, c.iconMuted]);

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
