/**
 * Bounties - Standalone route for browsing/claiming/posting bounties.
 *
 * The same content also appears as a segment inside the Quests tab
 * on mobile. This route stays for direct URL access (e.g., back nav
 * from a bounty detail page) and for desktop sidebar navigation.
 */

import React from 'react';
import { ScrollView, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VStack, Heading } from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { BountiesView } from '@/src/components/bounties/BountiesView';

export default function BountiesScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <VStack className="max-w-5xl w-full md:mx-auto">
          <PageHeader title="Bounties" />
          <View className="px-5 md:px-8 pt-2 md:pt-6 pb-4 hidden md:flex">
            <Heading size="2xl">Bounties</Heading>
          </View>
          <BountiesView />
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
