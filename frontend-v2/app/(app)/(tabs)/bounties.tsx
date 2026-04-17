/**
 * Bounties - Browse bounties, track claims, manage posted bounties.
 */

import React, { useState } from 'react';
import { View, ScrollView, Pressable, FlatList, Platform, useWindowDimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { useBounties, useMyClaims, useMyPosted, deleteBounty, turnInBounty } from '@/src/hooks/useBounties';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Skeleton, PillarBadge,
} from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';

type Tab = 'browse' | 'claims' | 'posted';

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  claimed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
  submitted: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Submitted' },
  approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  revision_requested: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Revise' },
};

/** Return { icon, text, color } for a bounty's reward display. */
function rewardLabel(bounty: any): { icon: string; text: string; color: string } {
  if (bounty.xp_reward > 0) return { icon: 'star', text: `${bounty.xp_reward} XP`, color: '#FF9028' };
  const custom = (bounty.rewards || []).find((r: any) => r.type === 'custom');
  if (custom?.text) return { icon: 'gift-outline', text: custom.text, color: '#B45309' };
  return { icon: 'star', text: '0 XP', color: '#FF9028' };
}

function BountyCard({ bounty, showClaim }: { bounty: any; showClaim?: boolean }) {
  return (
    <Pressable onPress={() => router.push(`/bounties/${bounty.id}`)}>
      <Card variant="elevated" size="md">
        <VStack space="sm">
          {/* Pillar + reward header */}
          <HStack className="items-center justify-between">
            <PillarBadge pillar={bounty.pillar} size="md" />
            {(() => { const r = rewardLabel(bounty); return (
              <HStack className="items-center gap-1">
                <Ionicons name={r.icon as any} size={14} color={r.color} />
                <UIText size="sm" className="font-poppins-bold" style={{ color: r.color }} numberOfLines={1}>{r.text}</UIText>
              </HStack>
            ); })()}
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
            <Button size="md" className="w-full mt-1" onPress={() => router.push(`/bounties/${bounty.id}`)}>
              <ButtonText>Claim Bounty</ButtonText>
            </Button>
          )}
        </VStack>
      </Card>
    </Pressable>
  );
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  claimed: { bg: '#DBEAFE', text: '#1D4ED8' },
  submitted: { bg: '#FEF3C7', text: '#B45309' },
  approved: { bg: '#DCFCE7', text: '#15803D' },
  rejected: { bg: '#FEE2E2', text: '#B91C1C' },
  revision_requested: { bg: '#FFEDD5', text: '#C2410C' },
};

function ClaimCard({ claim, onTurnedIn }: { claim: any; onTurnedIn?: () => void }) {
  const bounty = claim.bounty || {};
  const sc = statusConfig[claim.status] || statusConfig.claimed;
  const colors = STATUS_COLORS[claim.status] || STATUS_COLORS.claimed;
  const completedIds = new Set(claim.evidence?.completed_deliverables || []);
  const deliverables = bounty.deliverables || [];
  const completedCount = completedIds.size;
  const totalCount = deliverables.length;
  const hasProgress = totalCount > 0;
  const allDone = completedCount === totalCount && totalCount > 0;
  const [turningIn, setTurningIn] = useState(false);

  const handleTurnIn = async () => {
    setTurningIn(true);
    try {
      await turnInBounty(claim.bounty_id, claim.id);
      onTurnedIn?.();
    } catch { Alert.alert('Error', 'Failed to turn in bounty'); }
    finally { setTurningIn(false); }
  };

  return (
    <Pressable onPress={() => router.push(`/bounties/${claim.bounty_id}`)}>
      <Card variant="outline" size="md">
        <VStack space="sm">
          <HStack className="items-center justify-between">
            <HStack className="items-center gap-2">
              <View style={{ backgroundColor: colors.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                <UIText size="xs" style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>
                  {sc.label}
                </UIText>
              </View>
              {bounty.pillar && <PillarBadge pillar={bounty.pillar} />}
            </HStack>
            {(() => { const r = rewardLabel(bounty); return (
              <HStack className="items-center gap-1">
                <Ionicons name={r.icon as any} size={12} color={r.color} />
                <UIText size="xs" className="font-poppins-medium" style={{ color: r.color }} numberOfLines={1}>{r.text}</UIText>
              </HStack>
            ); })()}
          </HStack>
          <Heading size="sm" numberOfLines={2}>{bounty.title || 'Bounty'}</Heading>
          <UIText size="xs" className="text-typo-500" numberOfLines={2}>{bounty.description}</UIText>

          {/* Deliverables checklist */}
          {hasProgress && (
            <VStack space="xs">
              <HStack className="items-center justify-between">
                <UIText size="xs" className="text-typo-400 font-poppins-medium">
                  {completedCount}/{totalCount} deliverable{totalCount !== 1 ? 's' : ''}
                </UIText>
                {allDone && <Ionicons name="checkmark-circle" size={14} color="#16A34A" />}
              </HStack>
              <View className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full bg-optio-purple"
                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                />
              </View>
              {deliverables.map((d: any) => (
                <HStack key={d.id} className="items-center gap-2 pl-1">
                  <Ionicons
                    name={completedIds.has(d.id) ? 'checkmark-circle' : 'ellipse-outline'}
                    size={14}
                    color={completedIds.has(d.id) ? '#16A34A' : '#D1D5DB'}
                  />
                  <UIText size="xs" className={completedIds.has(d.id) ? 'text-typo-400 line-through' : 'text-typo-600'} numberOfLines={1}>
                    {d.text}
                  </UIText>
                </HStack>
              ))}
            </VStack>
          )}

          {/* Turn in button (when all deliverables complete) */}
          {claim.status === 'claimed' && allDone && (
            <Button size="md" className="w-full mt-1" onPress={(e: any) => { e.stopPropagation?.(); handleTurnIn(); }} disabled={turningIn}>
              <ButtonText>{turningIn ? 'Submitting...' : 'Turn In'}</ButtonText>
            </Button>
          )}

          {(claim.status === 'claimed' && !allDone) && (
            <Button size="md" variant="outline" className="w-full mt-1" onPress={() => router.push(`/bounties/${claim.bounty_id}`)}>
              <ButtonText>Continue</ButtonText>
            </Button>
          )}

          {claim.status === 'revision_requested' && (
            <Button size="md" variant="outline" className="w-full mt-1" onPress={() => router.push(`/bounties/${claim.bounty_id}`)}>
              <ButtonText>Revise</ButtonText>
            </Button>
          )}
        </VStack>
      </Card>
    </Pressable>
  );
}

export default function BountiesScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('browse');

  const isStudent = user?.role === 'student' || user?.org_role === 'student';
  const canPost = !isStudent || user?.role === 'superadmin';

  const { bounties, loading: browsing } = useBounties();
  const { claims, loading: claimsLoading, refetch: refetchClaims } = useMyClaims();
  const { bounties: posted, loading: postedLoading, refetch: refetchPosted } = useMyPosted();

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
          <PageHeader title="Bounties" />
          <View className="px-5 md:px-8 pt-2 md:pt-6 pb-4 hidden md:flex">
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
                  {claims.map((c: any) => <ClaimCard key={c.id} claim={c} onTurnedIn={refetchClaims} />)}
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
              {canPost && (
                <Button size="md" className="w-full mb-4" onPress={() => router.push('/bounties/create')}>
                  <ButtonText>Post Bounty</ButtonText>
                </Button>
              )}
              {postedLoading ? (
                <VStack space="sm">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</VStack>
              ) : posted.length > 0 ? (
                <VStack space="sm">
                  {posted.map((b: any) => (
                    <Pressable key={b.id} onPress={() => router.push(`/bounties/review/${b.id}`)}>
                      <Card variant="outline" size="md">
                        <VStack space="sm">
                          <HStack className="items-center justify-between">
                            <PillarBadge pillar={b.pillar} size="md" />
                            <HStack className="items-center gap-2">
                              {(b.claims || []).filter((c: any) => c.status === 'submitted').length > 0 && (
                                <View className="bg-amber-50 px-2 py-0.5 rounded-full">
                                  <UIText size="xs" className="text-amber-700 font-poppins-semibold">
                                    {(b.claims || []).filter((c: any) => c.status === 'submitted').length} to review
                                  </UIText>
                                </View>
                              )}
                              <Pressable
                                onPress={(e) => {
                                  e.stopPropagation?.();
                                  router.push(`/bounties/create?edit=${b.id}`);
                                }}
                              >
                                <Ionicons name="create-outline" size={18} color="#6D469B" />
                              </Pressable>
                              <Pressable
                                onPress={async (e) => {
                                  e.stopPropagation?.();
                                  const confirmed = Platform.OS === 'web'
                                    ? window.confirm(`Delete "${b.title}"?`)
                                    : await new Promise<boolean>((resolve) =>
                                        Alert.alert('Delete Bounty', `Delete "${b.title}"?`, [
                                          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                                          { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
                                        ])
                                      );
                                  if (!confirmed) return;
                                  try { await deleteBounty(b.id); refetchPosted(); } catch { /* silently fail */ }
                                }}
                              >
                                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                              </Pressable>
                            </HStack>
                          </HStack>
                          <Heading size="sm" numberOfLines={2}>{b.title}</Heading>
                          <UIText size="xs" className="text-typo-400">
                            {(b.claims || []).length} claimed
                          </UIText>
                        </VStack>
                      </Card>
                    </Pressable>
                  ))}
                </VStack>
              ) : (
                <Card variant="filled" size="lg" className="items-center py-10">
                  <Ionicons name="create-outline" size={40} color="#9CA3AF" />
                  <Heading size="sm" className="text-typo-500 mt-3">No posted bounties</Heading>
                  <UIText size="sm" className="text-typo-400 mt-1">
                    {canPost ? 'Post your first bounty above' : 'Parents and advisors can post bounties'}
                  </UIText>
                </Card>
              )}
            </View>
          )}
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
