/**
 * Bounties - Browse bounties, track claims, manage posted bounties.
 * Mobile-optimized: horizontally scrollable pillar filters, full-width cards.
 */

import React, { useState } from 'react';
import { View, ScrollView, Pressable, FlatList, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBounties, useMyClaims, useMyPosted } from '@/src/hooks/useBounties';
import { pillars as pillarMap, pillarKeys, pillarShortLabels, getPillar } from '@/src/config/pillars';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Skeleton, PillarBadge,
} from '@/src/components/ui';

type Tab = 'browse' | 'claims' | 'posted';

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  claimed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
  submitted: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Submitted' },
  approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  revision_requested: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Revise' },
};

function BountyCard({ bounty, showClaim }: { bounty: any; showClaim?: boolean }) {
  return (
    <Card variant="elevated" size="md">
      <VStack space="sm">
        {/* Pillar + XP header */}
        <HStack className="items-center justify-between">
          <PillarBadge pillar={bounty.pillar} size="md" />
          <HStack className="items-center gap-1">
            <Ionicons name="star" size={14} color="#FF9028" />
            <UIText size="sm" className="font-poppins-bold text-pillar-civics">{bounty.xp_reward || 0} XP</UIText>
          </HStack>
        </HStack>

        {/* Title + description */}
        <Heading size="sm" numberOfLines={2}>{bounty.title}</Heading>
        <UIText size="sm" className="text-typo-500" numberOfLines={3}>{bounty.description}</UIText>

        {/* Deliverables count */}
        {bounty.deliverables?.length > 0 && (
          <HStack className="items-center gap-1.5">
            <Ionicons name="checkbox-outline" size={14} color="#9CA3AF" />
            <UIText size="xs" className="text-typo-400">
              {bounty.deliverables.length} deliverable{bounty.deliverables.length !== 1 ? 's' : ''}
            </UIText>
          </HStack>
        )}

        {/* Claim button */}
        {showClaim && (
          <Button size="md" className="w-full mt-1">
            <ButtonText>Claim Bounty</ButtonText>
          </Button>
        )}
      </VStack>
    </Card>
  );
}

function ClaimCard({ claim }: { claim: any }) {
  const bounty = claim.bounty || {};
  const sc = statusConfig[claim.status] || statusConfig.claimed;

  return (
    <Card variant="outline" size="md">
      <VStack space="sm">
        <HStack className="items-center justify-between">
          <HStack className="items-center gap-2">
            <View style={{ backgroundColor: sc.bg === 'bg-blue-100' ? '#DBEAFE' : sc.bg === 'bg-amber-100' ? '#FEF3C7' : sc.bg === 'bg-green-100' ? '#DCFCE7' : sc.bg === 'bg-red-100' ? '#FEE2E2' : '#FFEDD5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <UIText size="xs" style={{ color: sc.text === 'text-blue-700' ? '#1D4ED8' : sc.text === 'text-amber-700' ? '#B45309' : sc.text === 'text-green-700' ? '#15803D' : sc.text === 'text-red-700' ? '#B91C1C' : '#C2410C', fontFamily: 'Poppins_600SemiBold' }}>
                {sc.label}
              </UIText>
            </View>
            {bounty.pillar && <PillarBadge pillar={bounty.pillar} />}
          </HStack>
          <HStack className="items-center gap-1">
            <Ionicons name="star" size={12} color="#FF9028" />
            <UIText size="xs" className="font-poppins-medium" style={{ color: '#FF9028' }}>{bounty.xp_reward || 0} XP</UIText>
          </HStack>
        </HStack>
        <Heading size="sm" numberOfLines={2}>{bounty.title || 'Bounty'}</Heading>
        <UIText size="xs" className="text-typo-500" numberOfLines={2}>{bounty.description}</UIText>
        {claim.status === 'claimed' && (
          <Button size="md" variant="outline" className="w-full mt-1">
            <ButtonText>Continue</ButtonText>
          </Button>
        )}
      </VStack>
    </Card>
  );
}

export default function BountiesScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;
  const [tab, setTab] = useState<Tab>('browse');
  const [pillarFilter, setPillarFilter] = useState<string | undefined>(undefined);

  const { bounties, loading: browsing } = useBounties(pillarFilter);
  const { claims, loading: claimsLoading } = useMyClaims();
  const { bounties: posted, loading: postedLoading } = useMyPosted();

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'browse', label: 'Browse' },
    { key: 'claims', label: 'My Claims', count: claims.length || undefined },
    { key: 'posted', label: 'Posted', count: posted.length || undefined },
  ];

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <VStack className="max-w-5xl w-full md:mx-auto">
          {/* Header */}
          <View className="px-5 md:px-8 pt-6 pb-4">
            <Heading size="2xl">Bounties</Heading>
          </View>

          {/* Tab switcher */}
          <View className="px-5 md:px-8 mb-4">
            <HStack className="bg-surface-100 rounded-xl p-1" space="xs">
              {tabs.map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  className={`flex-1 py-2.5 rounded-lg items-center ${tab === t.key ? 'bg-white shadow-sm' : ''}`}
                >
                  <HStack className="items-center gap-1">
                    <UIText size="sm" className={tab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500'}>
                      {t.label}
                    </UIText>
                    {t.count && t.count > 0 && (
                      <View className="bg-optio-purple/15 px-1.5 rounded-full">
                        <UIText size="xs" className="text-optio-purple font-poppins-semibold">{t.count}</UIText>
                      </View>
                    )}
                  </HStack>
                </Pressable>
              ))}
            </HStack>
          </View>

          {/* Browse tab */}
          {tab === 'browse' && (
            <VStack space="md">
              {/* Pillar filters - horizontally scrollable, no clip */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
              >
                <Pressable onPress={() => setPillarFilter(undefined)}>
                  <View
                    style={{
                      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                      backgroundColor: !pillarFilter ? '#6D469B' : '#F3F4F6',
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                    }}
                  >
                    <Ionicons name="apps-outline" size={16} color={!pillarFilter ? '#fff' : '#6B7280'} />
                    <UIText size="sm" style={{ fontFamily: 'Poppins_500Medium', color: !pillarFilter ? '#fff' : '#6B7280' }}>
                      All
                    </UIText>
                  </View>
                </Pressable>
                {pillarKeys.map((p) => {
                  const pc = getPillar(p);
                  const active = pillarFilter === p;
                  return (
                    <Pressable key={p} onPress={() => setPillarFilter(active ? undefined : p)}>
                      <View
                        style={{
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                          backgroundColor: active ? pc.color : '#F3F4F6',
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                        }}
                      >
                        <Ionicons
                          name={active ? pc.iconFilled : pc.icon}
                          size={16}
                          color={active ? '#fff' : pc.color}
                        />
                        <UIText size="sm" style={{ fontFamily: 'Poppins_500Medium', color: active ? '#fff' : pc.color }}>
                          {pillarShortLabels[p]}
                        </UIText>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Bounty list */}
              <View className="px-5 md:px-8">
                {browsing ? (
                  <VStack space="sm">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</VStack>
                ) : bounties.length > 0 ? (
                  <View className={`gap-4 ${isDesktop ? 'flex flex-row flex-wrap' : ''}`}>
                    {bounties.map((b: any) => (
                      <View key={b.id} className={isDesktop ? 'w-[calc(50%-8px)]' : ''}>
                        <BountyCard bounty={b} showClaim />
                      </View>
                    ))}
                  </View>
                ) : (
                  <Card variant="filled" size="lg" className="items-center py-10">
                    <Ionicons name="flag-outline" size={40} color="#9CA3AF" />
                    <Heading size="sm" className="text-typo-500 mt-3">No bounties available</Heading>
                    <UIText size="sm" className="text-typo-400 mt-1">Check back later for new bounties</UIText>
                  </Card>
                )}
              </View>
            </VStack>
          )}

          {/* Claims tab */}
          {tab === 'claims' && (
            <View className="px-5 md:px-8">
              {claimsLoading ? (
                <VStack space="sm">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</VStack>
              ) : claims.length > 0 ? (
                <VStack space="sm">
                  {claims.map((c: any) => <ClaimCard key={c.id} claim={c} />)}
                </VStack>
              ) : (
                <Card variant="filled" size="lg" className="items-center py-10">
                  <Ionicons name="hand-left-outline" size={40} color="#9CA3AF" />
                  <Heading size="sm" className="text-typo-500 mt-3">No active claims</Heading>
                  <UIText size="sm" className="text-typo-400 mt-1">Claim a bounty to get started</UIText>
                </Card>
              )}
            </View>
          )}

          {/* Posted tab */}
          {tab === 'posted' && (
            <View className="px-5 md:px-8">
              {postedLoading ? (
                <VStack space="sm">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</VStack>
              ) : posted.length > 0 ? (
                <VStack space="sm">
                  {posted.map((b: any) => <BountyCard key={b.id} bounty={b} />)}
                </VStack>
              ) : (
                <Card variant="filled" size="lg" className="items-center py-10">
                  <Ionicons name="create-outline" size={40} color="#9CA3AF" />
                  <Heading size="sm" className="text-typo-500 mt-3">No posted bounties</Heading>
                  <UIText size="sm" className="text-typo-400 mt-1">Parents and advisors can post bounties</UIText>
                </Card>
              )}
            </View>
          )}
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
