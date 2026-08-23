/**
 * Bounties - Browse/claim/post bounties. A first-class tab on mobile
 * (mobileTabOrder) and a sidebar destination on desktop.
 */

import React, { useRef, useState, useCallback } from 'react';
import { ScrollView, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScrollToTop } from '@react-navigation/native';
import { VStack, Heading } from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { BountiesView } from '@/src/components/bounties/BountiesView';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export default function BountiesScreen() {
  const c = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const refetchRef = useRef<null | (() => Promise<void>)>(null);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetchRef.current?.(); } finally { setRefreshing(false); }
  }, []);
  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
      >
        <VStack className="max-w-5xl w-full md:mx-auto">
          <PageHeader title="Bounties" />
          <View className="px-5 md:px-8 pt-2 md:pt-6 pb-4 hidden md:flex">
            <Heading size="2xl">Bounties</Heading>
          </View>
          <BountiesView onRefetchReady={(fn) => { refetchRef.current = fn; }} />
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
