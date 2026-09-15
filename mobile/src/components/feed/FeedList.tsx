/**
 * FeedList - the scrolling half of every feed screen: the FlatList of
 * FeedCards, its visibility tracking (so an inline video pauses when it
 * scrolls off), the empty card, the footer, pull-to-refresh, and the two
 * automatic refreshes (app foregrounded, background upload finished).
 *
 * The three role screens (StudentFeed, ParentFeed, ObserverFeed) each own
 * what differs -- the header, the segments, the welcome modal, which student
 * the feed is scoped to -- and hand the rest here. Until 2026-09-15 all of it
 * lived in one 840-line app/(app)/(tabs)/feed.tsx that branched on three
 * roles in every callback.
 */

import React, { useRef, useMemo, useCallback } from 'react';
import { View, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { create } from 'zustand';
import { router } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useRefetchOnForeground } from '@/src/hooks/useRefetchOnForeground';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { useFeedDetailStore } from '@/src/stores/feedDetailStore';
import { onUploadComplete } from '@/src/services/uploadQueue';
import { Heading, UIText, Card } from '@/src/components/ui';

/**
 * Which feed rows are currently on-screen. Kept in an external store rather than
 * screen state so that a scroll (which changes visibility constantly) does
 * NOT re-render the whole screen and rebuild `renderItem`. Each FeedRow
 * subscribes to just its own id, so only the one or two cards whose visibility
 * actually flips re-render — that's what pauses an inline video once it scrolls
 * off-screen. Feeding this through React state instead made every mounted card
 * re-render on every scroll frame, which is what made the feed choppy as you
 * scrolled down (more cards mounted = more wasted re-renders per frame).
 */
interface FeedVisibilityState {
  activeIds: Set<string>;
  setActiveIds: (ids: Set<string>) => void;
}
const useFeedVisibilityStore = create<FeedVisibilityState>((set) => ({
  activeIds: new Set<string>(),
  setActiveIds: (activeIds) => set({ activeIds }),
}));

// Hoisted so the FlatList sees the same component type / object identity on
// every render. Inline (`() => <View/>`, `{...}`) these remounted every
// separator and reset the content container on each screen render.
export const LIST_CONTENT_STYLE = { paddingHorizontal: 20, paddingBottom: 16 };
function FeedSeparator() {
  return <View className="h-3" />;
}
const feedKeyExtractor = (item: any) => item.id;

/**
 * One row. Subscribes to its own visibility and builds its own press handler,
 * so the list's renderItem stays stable across scrolls and `memo(FeedCard)`
 * holds.
 */
const FeedRow = React.memo(function FeedRow({
  item,
  isDesktop,
  viewerCanModerate,
  onOpen,
  onHighlightChange,
}: {
  item: any;
  isDesktop: boolean;
  viewerCanModerate: boolean;
  onOpen: (item: any) => void;
  onHighlightChange: (id: string, on: boolean) => void;
}) {
  const isActive = useFeedVisibilityStore((s) => s.activeIds.has(item.id));
  // Read the item through a ref so the handler identity survives even a change
  // of `item` (e.g. a refetch), while still opening the CURRENT item.
  const itemRef = useRef(item);
  itemRef.current = item;
  const handlePress = useCallback(() => onOpen(itemRef.current), [onOpen]);
  return (
    <View className={isDesktop ? 'max-w-2xl w-full mx-auto' : ''}>
      <FeedCard
        item={item}
        viewerCanModerate={viewerCanModerate}
        isActive={isActive}
        onPress={handlePress}
        onHighlightChange={onHighlightChange}
      />
    </View>
  );
});

export interface FeedListProps {
  items: any[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void | Promise<void>;
  setHighlighted: (id: string, on: boolean) => void;
  isDesktop: boolean;
  /** Pass an ELEMENT, not a render function: a `() => (...)` handed to
   *  ListHeaderComponent is a fresh component type on every render, which
   *  unmounts and remounts the whole header each time. */
  header: React.ReactElement;
  /** What the empty card says under "No activity yet". */
  emptyText: string;
  /** Whether the viewer may moderate (hide) this item; a parent for their own
   *  kids' items, nobody otherwise. Memoize it: it feeds renderItem. */
  canModerateItem?: (item: any) => boolean;
}

const never = () => false;

export function FeedList({
  items, loading, loadingMore, hasMore, loadMore, refetch, setHighlighted,
  isDesktop, header, emptyText, canModerateItem = never,
}: FeedListProps) {
  const c = useThemeColors();
  const listRef = useRef<FlatList<any>>(null);
  useScrollToTop(listRef);

  // Track which feed items are on-screen so an inline video pauses when scrolled
  // past instead of playing audio off-screen. onViewableItemsChanged must keep a
  // stable identity (FlatList errors otherwise), hence the ref. Push the result
  // into the visibility store (NOT component state) so a scroll only re-renders
  // the rows whose visibility changed — see useFeedVisibilityStore above.
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { item: any }[] }) => {
      useFeedVisibilityStore.getState().setActiveIds(
        new Set(viewableItems.map((v) => v.item?.id).filter(Boolean) as string[]),
      );
    },
  ).current;

  // Auto-refresh the feed when the app returns to the foreground while the feed
  // tab is open (bug #4: "no way to refresh the feed when I reopen the app after
  // a while"). Pull-to-refresh still covers the manual case.
  useRefetchOnForeground(refetch);
  // When a background media upload finishes (durable upload queue), refetch so
  // the real video/photo replaces the "Uploading…" placeholder without a manual
  // pull-to-refresh.
  React.useEffect(() => onUploadComplete(() => refetch()), [refetch]);

  const openPost = useCallback((item: any) => {
    // Hand the loaded item to the detail route (the feed API has no fetch-one
    // endpoint) and open the post on its own page.
    useFeedDetailStore.getState().setItem(item);
    router.push(`/(app)/post/${item.id}` as any);
  }, []);
  // No `viewableIds` dependency here — that's the whole point. renderItem stays
  // stable across scrolls, so FlatList doesn't rebuild every mounted row.
  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <FeedRow
        item={item}
        isDesktop={isDesktop}
        viewerCanModerate={canModerateItem(item)}
        onOpen={openPost}
        onHighlightChange={setHighlighted}
      />
    ),
    [isDesktop, canModerateItem, openPost, setHighlighted],
  );

  const listEmpty = useMemo(() => {
    if (loading) return null;
    return (
      <View className={`px-5 md:px-0 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        <Card variant="filled" size="lg" className="items-center py-10">
          <Ionicons name="newspaper-outline" size={40} color={c.iconMuted} />
          <Heading size="sm" className="text-typo-500 mt-3 dark:text-dark-typo-500">No activity yet</Heading>
          <UIText size="sm" className="text-typo-400 mt-1 text-center px-4 dark:text-dark-typo-400">
            {emptyText}
          </UIText>
        </Card>
      </View>
    );
  }, [loading, emptyText, isDesktop, c.iconMuted]);

  const listFooter = useMemo(() => {
    if (loadingMore) {
      return (
        <View className="items-center py-6">
          <ActivityIndicator size="small" color={c.brand} />
        </View>
      );
    }
    if (!hasMore && items.length > 0) {
      return (
        <View className="items-center py-6">
          <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">You've reached the end</UIText>
        </View>
      );
    }
    return null;
  }, [loadingMore, hasMore, items.length, c.brand]);

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={feedKeyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={listFooter}
      contentContainerStyle={LIST_CONTENT_STYLE}
      ItemSeparatorComponent={FeedSeparator}
      onEndReached={loadMore}
      onEndReachedThreshold={0.3}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      refreshing={false}
      onRefresh={refetch}
      showsVerticalScrollIndicator={false}
      // removeClippedSubviews detaches off-screen rows; with variable-height
      // feed images that made images flash in then blank out on scroll
      // (RN re-clips on the aspect-ratio layout pass). Keep it off and hold a
      // few more rows mounted so scrolling back doesn't remount/reload them.
      windowSize={7}
      maxToRenderPerBatch={5}
      removeClippedSubviews={false}
      initialNumToRender={5}
      updateCellsBatchingPeriod={100}
      scrollEventThrottle={64}
    />
  );
}

/** The full-screen spinner every feed shows before its first page. */
export function FeedLoading() {
  const c = useThemeColors();
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator size="large" color={c.brand} />
    </View>
  );
}

/** A two-way segment bar (Feed / Students, Feed / Highlights). */
export function SegmentBar<T extends string>({
  segments, value, onChange, isDesktop, icon,
}: {
  segments: { key: T; label: string }[];
  value: T;
  onChange: (s: T) => void;
  isDesktop: boolean;
  /** An icon for one segment, rendered before its label. */
  icon?: (key: T, active: boolean) => React.ReactNode;
}) {
  return (
    <View className={`pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
      <View className="flex-row bg-surface-100 rounded-xl p-1 dark:bg-dark-surface-200">
        {segments.map((s) => {
          const active = value === s.key;
          return (
            <SegmentButton key={s.key} active={active} onPress={() => onChange(s.key)} label={s.label} icon={icon?.(s.key, active)} />
          );
        })}
      </View>
    </View>
  );
}

function SegmentButton({ active, onPress, label, icon }: { active: boolean; onPress: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 py-2.5 rounded-lg items-center flex-row gap-1.5 justify-center ${active ? 'bg-white dark:bg-dark-surface-100' : ''}`}
    >
      {icon}
      <UIText size="sm" className={active ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>
        {label}
      </UIText>
    </Pressable>
  );
}
