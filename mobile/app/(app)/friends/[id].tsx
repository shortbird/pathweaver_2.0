/**
 * A friend's page -- their work, through the peer grant.
 *
 * The feed endpoint resolves friends alongside linked students, so filtering
 * it to one friend reads exactly what the friendship allows: their
 * non-confidential completions and moments, with reactions and peer
 * comments. Nothing else about them is shown here: display name and
 * picture, never a surname, an email, a school or a goal.
 */

import React from 'react';
import { View, FlatList, Pressable, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFeed } from '@/src/hooks/useFeed';
import { useFriends } from '@/src/hooks/useFriends';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { VStack, HStack, Heading, UIText, Card, Avatar, AvatarFallbackText, AvatarImage } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

const DESKTOP_BREAKPOINT = 768;

export default function FriendScreen() {
  const c = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const { connections } = useFriends();
  const friend = connections.active.find((x) => x.peer.id === id)?.peer;
  const { items, loading, loadingMore, hasMore, loadMore } = useFeed({ studentId: id });

  const name = friend?.display_name || 'Friend';
  const initial = (name[0] || '?').toUpperCase();

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
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Friends on Optio</UIText>
        </VStack>
      </HStack>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={c.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <FeedCard item={item} showStudent={false} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
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
    </SafeAreaView>
  );
}
