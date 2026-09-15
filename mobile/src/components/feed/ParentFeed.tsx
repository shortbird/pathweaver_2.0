/**
 * ParentFeed - what the parent's kids have been up to. Scoped to the child
 * in family scope (stores/familyStore) by default, with the one family
 * switcher offering "All"; a parent may hide a kid's item from here. The
 * Tips button reopens the first-visit welcome.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFeed } from '@/src/hooks/useFeed';
import { useMyChildren } from '@/src/hooks/useParent';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useFamilyStore } from '@/src/stores/familyStore';
import { ChildSwitcher } from '@/src/components/family/ChildSwitcher';
import { VStack, HStack, Heading, UIText } from '@/src/components/ui';
import { getFlag, setFlag, PrefsKeys } from '@/src/stores/prefsStore';
import { FeedList, FeedLoading } from './FeedList';
import { ParentWelcomeModal } from './ParentWelcomeModal';

export function ParentFeed({ isDesktop }: { isDesktop: boolean }) {
  const c = useThemeColors();
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  // Which kid the feed is scoped to. null = all kids. Starts on the child the
  // parent is working for (stores/familyStore); picking a kid in the switcher
  // below updates the store too, so Family and Feed agree.
  const scopedChildId = useFamilyStore((s) => s.selectedChildId);
  const [selectedKidId, setSelectedKidId] = useState<string | null>(scopedChildId);
  const feed = useFeed({ studentId: selectedKidId || undefined });
  const { children: kids } = useMyChildren();

  // One-shot welcome on first visit (cross-platform via prefsStore).
  useEffect(() => {
    let cancelled = false;
    getFlag(PrefsKeys.ParentWelcomeSeen).then((seen) => {
      if (!cancelled && !seen) setWelcomeVisible(true);
    });
    return () => { cancelled = true; };
  }, []);
  const dismissWelcome = () => {
    setWelcomeVisible(false);
    setFlag(PrefsKeys.ParentWelcomeSeen).catch(() => { /* ignore */ });
  };

  // A parent may hide their own kid's item. Membership per item rather than a
  // blanket grant: the feed may also carry observer-linked students who are
  // not this parent's kids.
  const kidIds = useMemo(() => new Set(kids.map((k) => k.id)), [kids]);
  const canModerateItem = useCallback(
    (item: any) => !!item?.student?.id && kidIds.has(item.student.id),
    [kidIds],
  );

  const header = useMemo(() => (
    <>
      <View className={`pt-2 md:pt-6 pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        <HStack className="items-center justify-between">
          <VStack>
            {isDesktop && <Heading size="xl">Family activity</Heading>}
            <UIText size="sm" className="text-typo-500 mt-1 dark:text-dark-typo-500">
              What your kids have been up to
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
      {/* Which kid the feed is about: the one family switcher, with "All" as a
       *  legitimate view. Single-kid families don't need it -- there's nothing
       *  to filter to. */}
      {kids.length > 1 && (
        <View className={`pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
          <ChildSwitcher allowAll onSelect={setSelectedKidId} />
        </View>
      )}
    </>
  ), [isDesktop, kids.length, c.brand]);

  if (feed.loading && feed.items.length === 0) return <FeedLoading />;

  return (
    <>
      <FeedList
        {...feed}
        isDesktop={isDesktop}
        header={header}
        emptyText="Tap the center button to capture a moment for your kid, or post a bounty to challenge them."
        canModerateItem={canModerateItem}
      />
      <ParentWelcomeModal visible={welcomeVisible} onClose={dismissWelcome} />
    </>
  );
}
