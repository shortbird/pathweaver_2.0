/**
 * ObserverFeed - activity from the students an observer follows, with a
 * second segment listing those students. The Tips button reopens the
 * first-visit welcome.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useScrollToTop } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useFeed } from '@/src/hooks/useFeed';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { VStack, HStack, Heading, UIText } from '@/src/components/ui';
import { getFlag, setFlag, PrefsKeys } from '@/src/stores/prefsStore';
import { FeedList, FeedLoading, SegmentBar, LIST_CONTENT_STYLE } from './FeedList';
import { ObserverStudentsList } from './ObserverStudentsList';
import { ObserverWelcomeModal } from './ObserverWelcomeModal';

type Segment = 'feed' | 'students';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'students', label: 'Students' },
];

export function ObserverFeed({ isDesktop }: { isDesktop: boolean }) {
  const c = useThemeColors();
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [segment, setSegment] = useState<Segment>('feed');
  const feed = useFeed({});
  const studentsScrollRef = useRef<ScrollView>(null);
  useScrollToTop(studentsScrollRef);

  // One-shot welcome on first visit (cross-platform via prefsStore).
  useEffect(() => {
    let cancelled = false;
    getFlag(PrefsKeys.ObserverWelcomeSeen).then((seen) => {
      if (!cancelled && !seen) setWelcomeVisible(true);
    });
    return () => { cancelled = true; };
  }, []);
  const dismissWelcome = () => {
    setWelcomeVisible(false);
    setFlag(PrefsKeys.ObserverWelcomeSeen).catch(() => { /* ignore */ });
  };

  const header = useMemo(() => (
    <>
      <View className={`pt-2 md:pt-6 pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        <HStack className="items-center justify-between">
          <VStack>
            {isDesktop && <Heading size="xl">Activity</Heading>}
            <UIText size="sm" className="text-typo-500 mt-1 dark:text-dark-typo-500">
              Stay close to the students you observe
            </UIText>
          </VStack>
          <Pressable
            onPress={() => setWelcomeVisible(true)}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-optio-purple/10 active:bg-optio-purple/20"
          >
            <Ionicons name="bulb-outline" size={16} color={c.brand} />
            <UIText size="xs" className="text-optio-purple font-poppins-medium">Tips</UIText>
          </Pressable>
        </HStack>
      </View>
      <SegmentBar segments={SEGMENTS} value={segment} onChange={setSegment} isDesktop={isDesktop} />
    </>
  ), [isDesktop, segment, c.brand]);

  if (feed.loading && feed.items.length === 0 && segment === 'feed') return <FeedLoading />;

  return (
    <>
      {segment === 'students' ? (
        <ScrollView
          ref={studentsScrollRef}
          className="flex-1"
          contentContainerStyle={LIST_CONTENT_STYLE}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={64}
        >
          {header}
          <ObserverStudentsList isDesktop={isDesktop} />
        </ScrollView>
      ) : (
        <FeedList
          {...feed}
          isDesktop={isDesktop}
          header={header}
          emptyText="Activity from the students you observe will show up here."
        />
      )}
      <ObserverWelcomeModal visible={welcomeVisible} onClose={dismissWelcome} />
    </>
  );
}
