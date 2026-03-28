/**
 * Unified Feed - All evidence from all sources (tasks, bounties, learning moments).
 *
 * Same endpoint and view for every role. The backend scopes results
 * by permissions (own activity, dependents, linked students, etc.).
 * Infinite scroll with cursor-based pagination.
 */

import React, { useState, useEffect } from 'react';
import { View, FlatList, ActivityIndicator, useWindowDimensions, Platform, Pressable, Image, ScrollView, Modal, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFeed } from '@/src/hooks/useFeed';
import { useAuthStore } from '@/src/stores/authStore';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { VStack, HStack, Heading, UIText, Card, Button, ButtonText, Divider } from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';

const DESKTOP_BREAKPOINT = 768;
const WELCOME_KEY = 'optio_observer_welcome_seen';

const OPTIO_ICON_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg';

function useIsObserver() {
  const user = useAuthStore((s) => s.user);
  if (!user) return false;
  const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
  return role === 'observer';
}

function ObserverWelcomeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 24,
          maxWidth: 480,
          width: '92%',
          maxHeight: '85%',
        }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 24 }}
          >
            <VStack space="lg">
              {/* Close button */}
              <Pressable
                onPress={onClose}
                style={{ position: 'absolute', right: 0, top: 0, zIndex: 10, padding: 4 }}
              >
                <View className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
                  <Ionicons name="close" size={18} color="#6B7280" />
                </View>
              </Pressable>

              {/* Hero */}
              <VStack space="sm" className="items-center pt-2">
                <Image
                  source={{ uri: OPTIO_ICON_URI }}
                  style={{ width: 48, height: 48 }}
                  resizeMode="contain"
                />
                <Heading size="xl" className="text-center">Welcome to Optio!</Heading>
                <UIText size="sm" className="text-typo-500 text-center">
                  Here's how you can support and celebrate the student's learning journey.
                </UIText>
              </VStack>

              {/* Philosophy */}
              <VStack space="xs">
                <Heading size="md">The Process Is The Goal</Heading>
                <UIText size="sm" className="text-typo-500 leading-5">
                  We celebrate curiosity, effort, and growth - not grades or test scores.
                  Students learn by doing self-directed quests that build real-world skills.
                </UIText>
              </VStack>

              <Divider />

              {/* Tips */}
              <VStack space="xs">
                <Heading size="md">Observer Tips</Heading>
                <VStack space="sm" className="mt-1">
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#6D469B', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Celebrate Effort</UIText>
                      <UIText size="xs" className="text-typo-400">"I love how you tried a new approach!"</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#E85D8A', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Ask Process Questions</UIText>
                      <UIText size="xs" className="text-typo-400">"What was the most challenging part?"</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#3B82F6', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Show Genuine Interest</UIText>
                      <UIText size="xs" className="text-typo-400">"Tell me more about this project!"</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#10B981', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Acknowledge Growth</UIText>
                      <UIText size="xs" className="text-typo-400">"I can see how much you've learned!"</UIText>
                    </VStack>
                  </HStack>
                </VStack>
              </VStack>

              <Divider />

              {/* What You Can Do */}
              <VStack space="xs">
                <Heading size="md">What You Can Do</Heading>
                <HStack className="flex-wrap gap-2 mt-1">
                  <HStack className="items-center gap-2 bg-optio-purple/5 rounded-lg px-3 py-2">
                    <Ionicons name="heart-outline" size={16} color="#6D469B" />
                    <UIText size="xs" className="font-poppins-medium">Like</UIText>
                  </HStack>
                  <HStack className="items-center gap-2 bg-optio-pink/5 rounded-lg px-3 py-2">
                    <Ionicons name="chatbubble-outline" size={16} color="#E85D8A" />
                    <UIText size="xs" className="font-poppins-medium">Comment</UIText>
                  </HStack>
                  <HStack className="items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                    <Ionicons name="newspaper-outline" size={16} color="#3B82F6" />
                    <UIText size="xs" className="font-poppins-medium">View Feed</UIText>
                  </HStack>
                  <HStack className="items-center gap-2 bg-green-50 rounded-lg px-3 py-2">
                    <Ionicons name="share-outline" size={16} color="#10B981" />
                    <UIText size="xs" className="font-poppins-medium">Share</UIText>
                  </HStack>
                </HStack>
              </VStack>

              {/* CTA */}
              <Button size="lg" onPress={onClose} className="w-full mt-2">
                <ButtonText>Got It</ButtonText>
              </Button>
            </VStack>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function FeedScreen() {
  const { items, loading, loadingMore, hasMore, loadMore, refetch } = useFeed();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const isObserver = useIsObserver();
  const [welcomeVisible, setWelcomeVisible] = useState(false);

  // Auto-show on first visit for observers
  useEffect(() => {
    if (!isObserver) return;
    try {
      const seen = Platform.OS === 'web'
        ? localStorage.getItem(WELCOME_KEY)
        : null; // AsyncStorage would go here for native
      if (!seen) setWelcomeVisible(true);
    } catch { /* ignore */ }
  }, [isObserver]);

  const dismissWelcome = () => {
    setWelcomeVisible(false);
    try {
      if (Platform.OS === 'web') localStorage.setItem(WELCOME_KEY, 'true');
    } catch { /* ignore */ }
  };

  const renderItem = ({ item }: { item: any }) => (
    <View className={isDesktop ? 'max-w-2xl w-full mx-auto' : ''}>
      <FeedCard item={item} />
    </View>
  );

  const renderHeader = () => (
    <>
      <PageHeader title="Feed" />
      <View className={`px-5 md:px-0 pt-2 md:pt-6 pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        <HStack className="items-center justify-between">
          <VStack>
            {isDesktop && <Heading size="xl">Feed</Heading>}
            <UIText size="sm" className="text-typo-500 mt-1">
              Recent completions and learning moments
            </UIText>
          </VStack>
          {isObserver && (
            <Pressable
              onPress={() => setWelcomeVisible(true)}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-optio-purple/10 active:bg-optio-purple/20"
            >
              <Ionicons name="bulb-outline" size={16} color="#6D469B" />
              <UIText size="xs" className="text-optio-purple font-poppins-medium">Tips</UIText>
            </Pressable>
          )}
        </HStack>
      </View>
    </>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View className={`px-5 md:px-0 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        <Card variant="filled" size="lg" className="items-center py-10">
          <Ionicons name="newspaper-outline" size={40} color="#9CA3AF" />
          <Heading size="sm" className="text-typo-500 mt-3">No activity yet</Heading>
          <UIText size="sm" className="text-typo-400 mt-1 text-center px-4">
            Complete tasks and capture learning moments to build your feed.
          </UIText>
        </Card>
      </View>
    );
  };

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#6D469B" />
        </View>
      );
    }
    if (!hasMore && items.length > 0) {
      return (
        <View className="items-center py-6">
          <UIText size="xs" className="text-typo-300">You've reached the end</UIText>
        </View>
      );
    }
    return null;
  };

  if (loading && items.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6D469B" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshing={false}
        onRefresh={refetch}
        showsVerticalScrollIndicator={false}
      />
      <ObserverWelcomeModal visible={welcomeVisible} onClose={dismissWelcome} />
    </SafeAreaView>
  );
}
