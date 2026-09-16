/**
 * A friend's page -- their work, through the peer grant.
 *
 * The feed endpoint resolves friends alongside linked students, so filtering
 * it to one friend reads exactly what the friendship allows: their
 * non-confidential completions and moments, with peer comments. Above the
 * work (2026-09-16): since when and the classes the two share, then the
 * quests the friend is on that this student may see -- the ones they are
 * BOTH on first and marked -- and Collaborate, which invites the friend to
 * one of this student's own quests. Nothing else about them is shown here:
 * display name and picture, never a surname, an email, a school, a goal, or
 * how far along they are.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, FlatList, Pressable, ActivityIndicator, Platform, useWindowDimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFeed } from '@/src/hooks/useFeed';
import { getFriendPage, messagesRouteFor, type FriendPage } from '@/src/hooks/useFriends';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { CollaborateSheet } from '@/src/components/friends/CollaborateSheet';
import { VStack, HStack, Heading, UIText, Card, Avatar, AvatarFallbackText, AvatarImage, Button, ButtonText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

const DESKTOP_BREAKPOINT = 768;

function sinceLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Friends since ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function FriendScreen() {
  const c = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  // undefined: loading; null: not a friend (the server refused).
  const [page, setPage] = useState<FriendPage | null | undefined>(undefined);
  const [collaborating, setCollaborating] = useState(false);
  const { items, loading, loadingMore, hasMore, loadMore } = useFeed({ studentId: id });

  useEffect(() => {
    let cancelled = false;
    if (!id) return undefined;
    getFriendPage(id)
      .then((p) => { if (!cancelled) setPage(p?.peer ? p : null); })
      .catch(() => { if (!cancelled) setPage(null); });
    return () => { cancelled = true; };
  }, [id]);

  const friend = page?.peer;
  const name = friend?.display_name || 'Friend';
  const initial = (name[0] || '?').toUpperCase();
  const context = useMemo(() => [
    sinceLabel(page?.friends_since ?? null),
    page?.shared_classes?.length ? `In ${page.shared_classes.join(', ')} with you` : null,
  ].filter(Boolean).join(' · '), [page]);

  const header = useMemo(() => {
    if (!page) return null;
    const quests = page.quests || [];
    return (
      <View className={isDesktop ? 'max-w-2xl w-full mx-auto' : ''}>
        <HStack className="items-center justify-between mt-1 mb-2">
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase tracking-wide">
            Working on
          </UIText>
          {page.my_quests.length > 0 && (
            <Button size="xs" variant="outline" onPress={() => setCollaborating(true)} testID="friend-collaborate-button">
              <ButtonText>Collaborate</ButtonText>
            </Button>
          )}
        </HStack>
        {quests.length === 0 ? (
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mb-4">No quests in progress right now.</UIText>
        ) : (
          <VStack space="xs" className="mb-4">
            {quests.map((q) => (
              <Pressable
                key={q.id}
                onPress={() => router.push(`/(app)/quests/${q.id}` as Href)}
                accessibilityRole="button"
                accessibilityLabel={q.title}
                testID={`friend-quest-${q.id}`}
                className={`flex-row items-center gap-3 rounded-lg border bg-white dark:bg-dark-surface-100 p-3 ${q.shared ? 'border-optio-purple/40' : 'border-surface-200 dark:border-dark-surface-200'}`}
              >
                {q.image_url ? (
                  <Image source={{ uri: q.image_url }} style={{ width: 40, height: 40, borderRadius: 6 }} />
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 6 }} className="bg-optio-purple/10" />
                )}
                <VStack className="flex-1 min-w-0">
                  <UIText size="sm" className="font-poppins-medium text-typo dark:text-dark-typo" numberOfLines={1}>{q.title}</UIText>
                  {q.shared && (
                    <UIText size="xs" className="text-optio-purple dark:text-optio-purple-light">You are both on this</UIText>
                  )}
                </VStack>
              </Pressable>
            ))}
          </VStack>
        )}
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium uppercase tracking-wide mb-2">
          Work
        </UIText>
      </View>
    );
  }, [page, isDesktop]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top']}>
      <HStack className="items-center px-4 py-3" space="sm">
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={c.icon} />
        </Pressable>
        <Avatar size="md">
          {friend?.avatar_url ? <AvatarImage source={{ uri: friend.avatar_url }} /> : <AvatarFallbackText>{initial}</AvatarFallbackText>}
        </Avatar>
        <VStack className="flex-1 min-w-0">
          <Heading size="md" numberOfLines={1}>{name}</Heading>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{context || 'Friends on Optio'}</UIText>
        </VStack>
        {page?.can_message && (
          <Pressable
            onPress={() => router.push(messagesRouteFor(id) as Href)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Message ${name}`}
            testID="friend-message-button"
            style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={c.brand} />
          </Pressable>
        )}
      </HStack>

      {page === undefined || (loading && items.length === 0) ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={c.brand} /></View>
      ) : page === null ? (
        <View className="px-4 pt-6">
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">You are not friends with this student.</UIText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <FeedCard item={item} showStudent={false} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          ListHeaderComponent={header}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator className="my-4" color={c.brand} /> : hasMore ? null : <View className="h-4" />}
          ListEmptyComponent={
            <View className={isDesktop ? 'max-w-2xl w-full mx-auto' : ''}>
              <Card variant="filled" size="lg" className="items-center py-10">
                <Ionicons name="sparkles-outline" size={36} color={c.iconMuted} />
                <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-2 text-center">
                  {name} hasn't shared anything yet.
                </UIText>
              </Card>
            </View>
          }
        />
      )}

      {page && (
        <CollaborateSheet
          visible={collaborating}
          onClose={() => setCollaborating(false)}
          friend={page.peer}
          quests={page.my_quests}
        />
      )}
    </SafeAreaView>
  );
}
