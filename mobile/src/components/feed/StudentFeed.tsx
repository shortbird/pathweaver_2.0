/**
 * StudentFeed - the signed-in learner's own feed: their completions and
 * moments, their friends' work, and the door to Friends. A superadmin gets a
 * second segment, Highlights, that flips the source to the curated reel.
 */

import React, { useState, useMemo } from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFeed } from '@/src/hooks/useFeed';
import { useAuthStore } from '@/src/stores/authStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { VStack, HStack, Heading, UIText } from '@/src/components/ui';
import { FeedList, FeedLoading, SegmentBar } from './FeedList';

type Segment = 'feed' | 'highlights';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'highlights', label: 'Highlights' },
];

export function StudentFeed({ isDesktop }: { isDesktop: boolean }) {
  const c = useThemeColors();
  const isSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin';
  const [segment, setSegment] = useState<Segment>('feed');
  const feed = useFeed({ highlightsOnly: segment === 'highlights' });

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
          </Pressable>
        </HStack>
      </View>
      {isSuperadmin && (
        <SegmentBar
          segments={SEGMENTS}
          value={segment}
          onChange={setSegment}
          isDesktop={isDesktop}
          icon={(key, active) => key === 'highlights'
            ? <Ionicons name={active ? 'star' : 'star-outline'} size={14} color={active ? '#FF9028' : c.iconMuted} />
            : null}
        />
      )}
    </>
  ), [isDesktop, isSuperadmin, segment, c.brand, c.iconMuted]);

  if (feed.loading && feed.items.length === 0) return <FeedLoading />;

  return (
    <FeedList
      {...feed}
      isDesktop={isDesktop}
      header={header}
      emptyText="Complete tasks and capture learning moments to build your feed."
    />
  );
}
