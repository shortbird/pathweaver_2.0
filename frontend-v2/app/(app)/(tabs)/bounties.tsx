/**
 * Bounty Board - Browse bounties, track claims, manage posted bounties.
 */

import React, { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBounties, useMyClaims, useMyPosted } from '@/src/hooks/useBounties';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Badge, BadgeText, Skeleton,
} from '@/src/components/ui';

const pillarColors: Record<string, { bg: string; text: string }> = {
  stem: { bg: 'bg-pillar-stem/15', text: 'text-pillar-stem' },
  art: { bg: 'bg-pillar-art/15', text: 'text-pillar-art' },
  communication: { bg: 'bg-pillar-communication/15', text: 'text-pillar-communication' },
  civics: { bg: 'bg-pillar-civics/15', text: 'text-pillar-civics' },
  wellness: { bg: 'bg-pillar-wellness/15', text: 'text-pillar-wellness' },
};

const pillars = ['stem', 'art', 'communication', 'civics', 'wellness'];

type Tab = 'browse' | 'claims' | 'posted';

const statusColors: Record<string, { bg: string; text: string }> = {
  claimed: { bg: 'bg-blue-100', text: 'text-blue-700' },
  submitted: { bg: 'bg-amber-100', text: 'text-amber-700' },
  approved: { bg: 'bg-green-100', text: 'text-green-700' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
  revision_requested: { bg: 'bg-orange-100', text: 'text-orange-700' },
};

function BountyCard({ bounty, showClaim }: { bounty: any; showClaim?: boolean }) {
  const pColors = pillarColors[bounty.pillar] || pillarColors.stem;

  return (
    <Card variant="elevated" size="md">
      <VStack space="sm">
        <HStack className="items-start justify-between">
          <VStack className="flex-1 min-w-0" space="xs">
            <Heading size="sm" numberOfLines={2}>{bounty.title}</Heading>
            <UIText size="xs" className="text-typo-500" numberOfLines={3}>{bounty.description}</UIText>
          </VStack>
          <View className={`px-2.5 py-1 rounded-full ml-3 ${pColors.bg}`}>
            <UIText size="xs" className={`font-poppins-semibold ${pColors.text}`}>
              {bounty.pillar === 'stem' ? 'STEM' : bounty.pillar?.charAt(0).toUpperCase() + bounty.pillar?.slice(1)}
            </UIText>
          </View>
        </HStack>
        <HStack className="items-center gap-3">
          <HStack className="items-center gap-1">
            <Ionicons name="star" size={14} color="#FF9028" />
            <UIText size="xs" className="font-poppins-medium text-pillar-civics">{bounty.xp_reward || 0} XP</UIText>
          </HStack>
          {bounty.deliverables?.length > 0 && (
            <HStack className="items-center gap-1">
              <Ionicons name="checkbox-outline" size={14} color="#9CA3AF" />
              <UIText size="xs" className="text-typo-400">{bounty.deliverables.length} deliverable{bounty.deliverables.length !== 1 ? 's' : ''}</UIText>
            </HStack>
          )}
        </HStack>
        {showClaim && (
          <Button size="sm" className="self-start"><ButtonText>Claim Bounty</ButtonText></Button>
        )}
      </VStack>
    </Card>
  );
}

function ClaimCard({ claim }: { claim: any }) {
  const bounty = claim.bounty || {};
  const sColors = statusColors[claim.status] || statusColors.claimed;

  return (
    <Card variant="outline" size="md">
      <VStack space="sm">
        <HStack className="items-center justify-between">
          <Heading size="sm" className="flex-1" numberOfLines={1}>{bounty.title || 'Bounty'}</Heading>
          <View className={`px-2.5 py-1 rounded-full ${sColors.bg}`}>
            <UIText size="xs" className={`font-poppins-semibold capitalize ${sColors.text}`}>{claim.status?.replace('_', ' ')}</UIText>
          </View>
        </HStack>
        <UIText size="xs" className="text-typo-500" numberOfLines={2}>{bounty.description}</UIText>
        {claim.status === 'claimed' && (
          <Button size="sm" variant="outline" className="self-start"><ButtonText>Continue</ButtonText></Button>
        )}
      </VStack>
    </Card>
  );
}

export default function BountiesScreen() {
  const [tab, setTab] = useState<Tab>('browse');
  const [pillarFilter, setPillarFilter] = useState<string | undefined>(undefined);

  const { bounties, loading: browsing } = useBounties(pillarFilter);
  const { claims, loading: claimsLoading } = useMyClaims();
  const { bounties: posted, loading: postedLoading } = useMyPosted();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'browse', label: 'Browse' },
    { key: 'claims', label: `My Claims${claims.length > 0 ? ` (${claims.length})` : ''}` },
    { key: 'posted', label: `Posted${posted.length > 0 ? ` (${posted.length})` : ''}` },
  ];

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" contentContainerClassName="px-5 md:px-8 pt-6 pb-12" showsVerticalScrollIndicator={false}>
        <VStack space="lg" className="max-w-5xl w-full md:mx-auto">
          <Heading size="2xl">Bounty Board</Heading>

          <HStack className="bg-surface-100 rounded-xl p-1" space="xs">
            {tabs.map((t) => (
              <Pressable key={t.key} onPress={() => setTab(t.key)} className={`flex-1 py-2.5 rounded-lg items-center ${tab === t.key ? 'bg-white shadow-sm' : ''}`}>
                <UIText size="sm" className={tab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500'}>{t.label}</UIText>
              </Pressable>
            ))}
          </HStack>

          {tab === 'browse' && (
            <VStack space="md">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <HStack space="sm">
                  <Pressable onPress={() => setPillarFilter(undefined)}>
                    <View className={`px-4 py-2 rounded-full ${!pillarFilter ? 'bg-optio-purple' : 'bg-surface-200'}`}>
                      <UIText size="sm" className={`font-poppins-medium ${!pillarFilter ? 'text-white' : 'text-typo-500'}`}>All</UIText>
                    </View>
                  </Pressable>
                  {pillars.map((p) => (
                    <Pressable key={p} onPress={() => setPillarFilter(p)}>
                      <View className={`px-4 py-2 rounded-full ${pillarFilter === p ? 'bg-optio-purple' : 'bg-surface-200'}`}>
                        <UIText size="sm" className={`font-poppins-medium ${pillarFilter === p ? 'text-white' : 'text-typo-500'}`}>
                          {p === 'stem' ? 'STEM' : p.charAt(0).toUpperCase() + p.slice(1)}
                        </UIText>
                      </View>
                    </Pressable>
                  ))}
                </HStack>
              </ScrollView>

              {browsing ? (
                <VStack space="sm">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</VStack>
              ) : bounties.length > 0 ? (
                <View className="flex flex-col md:flex-row md:flex-wrap gap-4">
                  {bounties.map((b) => (
                    <View key={b.id} className="md:w-[calc(50%-8px)]"><BountyCard bounty={b} showClaim /></View>
                  ))}
                </View>
              ) : (
                <Card variant="filled" size="lg" className="items-center py-10">
                  <Ionicons name="trophy-outline" size={40} color="#9CA3AF" />
                  <Heading size="sm" className="text-typo-500 mt-3">No bounties available</Heading>
                  <UIText size="sm" className="text-typo-400 mt-1">Check back later for new bounties</UIText>
                </Card>
              )}
            </VStack>
          )}

          {tab === 'claims' && (
            <VStack space="sm">
              {claimsLoading ? (
                <VStack space="sm">{[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</VStack>
              ) : claims.length > 0 ? (
                claims.map((c) => <ClaimCard key={c.id} claim={c} />)
              ) : (
                <Card variant="filled" size="lg" className="items-center py-10">
                  <Ionicons name="hand-left-outline" size={40} color="#9CA3AF" />
                  <Heading size="sm" className="text-typo-500 mt-3">No active claims</Heading>
                  <UIText size="sm" className="text-typo-400 mt-1">Claim a bounty to get started</UIText>
                </Card>
              )}
            </VStack>
          )}

          {tab === 'posted' && (
            <VStack space="sm">
              {postedLoading ? (
                <VStack space="sm">{[1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</VStack>
              ) : posted.length > 0 ? (
                posted.map((b) => <BountyCard key={b.id} bounty={b} />)
              ) : (
                <Card variant="filled" size="lg" className="items-center py-10">
                  <Ionicons name="create-outline" size={40} color="#9CA3AF" />
                  <Heading size="sm" className="text-typo-500 mt-3">No posted bounties</Heading>
                  <UIText size="sm" className="text-typo-400 mt-1">Parents and advisors can post bounties for students</UIText>
                </Card>
              )}
            </VStack>
          )}
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
