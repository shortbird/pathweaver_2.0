/**
 * ProfileActivityFeed - student-scoped feed used on every in-app profile page.
 *
 * Replaces the old PortfolioSection (expand-a-quest → mount-all-evidence) which
 * locked the UI when a quest had many items. This component reuses the main
 * /feed loader (useFeed({ studentId })) so it pages cursor-style instead of
 * mounting the whole portfolio at once, and lets the viewer filter to a single
 * quest via a chip strip across the top.
 *
 * Filter is client-side over loaded items: /api/observers/feed doesn't accept
 * quest_id, and the per-profile feed is short enough that filtering pages on
 * the client is fine. Selecting a quest doesn't trigger a refetch; the user can
 * tap "Load more" to pull additional pages if their filter goes empty.
 */
import React, { useMemo, useState } from 'react';
import { View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Card, Button, ButtonText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useFeed, type FeedItem } from '@/src/hooks/useFeed';
import { FeedCard } from '@/src/components/feed/FeedCard';

interface ProfileActivityFeedProps {
  studentId: string | null | undefined;
  /** Whether to show the student avatar/name header on each card. The own-profile
   *  surface hides it (everything is "you"); parent/observer views show it so a
   *  parent following several kids can tell whose post they're looking at. */
  showStudent?: boolean;
  /** Parent and observer surfaces let the viewer toggle a kid's post private
   *  from the kid's feed without switching accounts; the own-profile view does
   *  not need this (the owner already has the toggle). */
  viewerCanModerate?: boolean;
}

interface QuestChip {
  id: string;
  title: string;
}

function collectQuests(items: FeedItem[]): QuestChip[] {
  const seen = new Map<string, string>();
  for (const it of items) {
    const qid = it.quest?.id;
    const qtitle = it.quest?.title;
    if (qid && qtitle && !seen.has(qid)) seen.set(qid, qtitle);
  }
  return Array.from(seen.entries())
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function ProfileActivityFeed({
  studentId,
  showStudent = true,
  viewerCanModerate = false,
}: ProfileActivityFeedProps) {
  const c = useThemeColors();
  const { items, loading, loadingMore, hasMore, loadMore } = useFeed({ studentId: studentId || undefined });
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);

  const quests = useMemo(() => collectQuests(items), [items]);
  const filtered = useMemo(
    () => (selectedQuestId ? items.filter((it) => it.quest?.id === selectedQuestId) : items),
    [items, selectedQuestId],
  );

  if (loading && items.length === 0) {
    return (
      <Card variant="elevated" size="md">
        <View className="items-center py-8">
          <ActivityIndicator color="#6D469B" />
        </View>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card variant="elevated" size="md">
        <VStack className="items-center py-6" space="sm">
          <Ionicons name="images-outline" size={40} color={c.iconMuted} />
          <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
            No activity yet
          </UIText>
        </VStack>
      </Card>
    );
  }

  return (
    <VStack space="md">
      {/* Quest filter chips — render whenever any task-completion items exist, even one,
          so the filter affordance is discoverable. "All" + chips. */}
      {quests.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 4, gap: 8 }}
        >
          <Chip label="All" active={selectedQuestId === null} onPress={() => setSelectedQuestId(null)} />
          {quests.map((q) => (
            <Chip
              key={q.id}
              label={q.title}
              active={selectedQuestId === q.id}
              onPress={() => setSelectedQuestId(q.id)}
            />
          ))}
        </ScrollView>
      )}

      {filtered.length === 0 ? (
        <Card variant="outline" size="md">
          <VStack className="items-center py-6" space="sm">
            <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
              No activity for this quest yet.
            </UIText>
            {hasMore && (
              <Button size="sm" variant="outline" onPress={loadMore} disabled={loadingMore}>
                <ButtonText>{loadingMore ? 'Loading…' : 'Load more'}</ButtonText>
              </Button>
            )}
          </VStack>
        </Card>
      ) : (
        filtered.map((item) => (
          <FeedCard
            key={`${item.type}:${item.id}`}
            item={item}
            showStudent={showStudent}
            viewerCanModerate={viewerCanModerate}
          />
        ))
      )}

      {filtered.length > 0 && hasMore && (
        <View className="items-center py-2">
          <Button size="sm" variant="outline" onPress={loadMore} disabled={loadingMore}>
            <ButtonText>{loadingMore ? 'Loading…' : 'Load more'}</ButtonText>
          </Button>
        </View>
      )}
    </VStack>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full border ${
        active
          ? 'bg-optio-purple border-optio-purple'
          : 'bg-surface-50 dark:bg-dark-surface-100 border-surface-300 dark:border-dark-surface-300'
      }`}
      style={{ minHeight: 32 }}
    >
      <UIText
        size="xs"
        className={`font-poppins-medium ${active ? 'text-white' : 'text-typo-600 dark:text-dark-typo-600'}`}
        numberOfLines={1}
      >
        {label}
      </UIText>
    </Pressable>
  );
}
