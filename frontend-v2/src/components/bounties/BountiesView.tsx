/**
 * BountiesView - Bounty browse/claims/posted experience.
 *
 * Renders without SafeAreaView/ScrollView wrappers so it can be embedded
 * inside other routes (e.g., the Quests tab as a segment, or the standalone
 * /bounties route).
 */

import React, { useState, useCallback } from 'react';
import { View, Pressable, Platform, Alert } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { usePreviewRoleStore } from '@/src/stores/previewRoleStore';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { useBounties, useMyClaims, useMyPosted, deleteBounty, turnInBounty } from '@/src/hooks/useBounties';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Skeleton, PillarBadge,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { BountyHowItWorks } from '@/src/components/bounties/BountyHowItWorks';

type Tab = 'browse' | 'claims' | 'posted';

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  claimed: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'In Progress' },
  submitted: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Submitted' },
  approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
  revision_requested: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Revise' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  claimed: { bg: '#DBEAFE', text: '#1D4ED8' },
  submitted: { bg: '#FEF3C7', text: '#B45309' },
  approved: { bg: '#DCFCE7', text: '#15803D' },
  rejected: { bg: '#FEE2E2', text: '#B91C1C' },
  revision_requested: { bg: '#FFEDD5', text: '#C2410C' },
};

export function rewardLabel(bounty: any): { icon: string; text: string; color: string } {
  if (bounty.xp_reward > 0) return { icon: 'star', text: `${bounty.xp_reward} XP`, color: '#FF9028' };
  const custom = (bounty.rewards || []).find((r: any) => r.type === 'custom');
  if (custom?.text) return { icon: 'gift-outline', text: custom.text, color: '#B45309' };
  return { icon: 'star', text: '0 XP', color: '#FF9028' };
}

export function BountyCard({
  bounty,
  showClaim,
  myClaim,
}: {
  bounty: any;
  showClaim?: boolean;
  /** When the viewer has an existing claim on this bounty, the card surfaces
   *  the claim status and switches the CTA to "Continue" / "View status". */
  myClaim?: any;
}) {
  const c = useThemeColors();
  const claimStatus = myClaim?.status as string | undefined;
  const sc = claimStatus ? statusConfig[claimStatus] : null;
  const ctaLabel = (() => {
    if (!showClaim) return null;
    if (!claimStatus) return 'View details';
    if (claimStatus === 'claimed' || claimStatus === 'revision_requested') return 'Continue';
    if (claimStatus === 'submitted') return 'View status';
    return 'View details';
  })();
  return (
    <Pressable onPress={() => router.push(`/bounties/${bounty.id}`)}>
      <Card variant="elevated" size="md">
        <VStack space="sm">
          <HStack className="items-center justify-between">
            <HStack className="items-center gap-2 flex-1 min-w-0">
              <PillarBadge pillar={bounty.pillar} size="md" />
              {sc && (
                <View className={`px-2 py-0.5 rounded-full ${sc.bg}`}>
                  <UIText size="xs" className={`font-poppins-medium ${sc.text}`}>
                    {sc.label}
                  </UIText>
                </View>
              )}
            </HStack>
            {(() => { const r = rewardLabel(bounty); return (
              <HStack className="items-center gap-1">
                <Ionicons name={r.icon as any} size={14} color={r.color} />
                <UIText size="sm" className="font-poppins-bold" style={{ color: r.color }} numberOfLines={1}>{r.text}</UIText>
              </HStack>
            ); })()}
          </HStack>
          <Heading size="sm" numberOfLines={2}>{bounty.title}</Heading>
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={3}>{bounty.description}</UIText>
          {bounty.deliverables?.length > 0 && (
            <HStack className="items-center gap-1.5">
              <Ionicons name="checkbox-outline" size={14} color={c.iconMuted} />
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                {bounty.deliverables.length} deliverable{bounty.deliverables.length !== 1 ? 's' : ''}
              </UIText>
            </HStack>
          )}
          {showClaim && ctaLabel && (
            <Button size="md" variant="outline" className="w-full mt-1" onPress={() => router.push(`/bounties/${bounty.id}`)}>
              <ButtonText>{ctaLabel}</ButtonText>
            </Button>
          )}
        </VStack>
      </Card>
    </Pressable>
  );
}

function ClaimCard({ claim, onTurnedIn }: { claim: any; onTurnedIn?: () => void }) {
  const c = useThemeColors();
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
          <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={2}>{bounty.description}</UIText>

          {hasProgress && (
            <VStack space="xs">
              <HStack className="items-center justify-between">
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">
                  {completedCount}/{totalCount} deliverable{totalCount !== 1 ? 's' : ''}
                </UIText>
                {allDone && <Ionicons name="checkmark-circle" size={14} color="#16A34A" />}
              </HStack>
              <View className="h-1.5 bg-surface-200 dark:bg-dark-surface-300 rounded-full overflow-hidden">
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
                    color={completedIds.has(d.id) ? '#16A34A' : c.iconMuted}
                  />
                  <UIText size="xs" className={completedIds.has(d.id) ? 'text-typo-400 dark:text-dark-typo-400 line-through' : 'text-typo-600'} numberOfLines={1}>
                    {d.text}
                  </UIText>
                </HStack>
              ))}
            </VStack>
          )}

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

// ── Poster review-queue layout ───────────────────────────────────────────
// Used for parents AND observers. Their JTBD here is identical: "approve my
// kid/student's submissions" + "post new bounties." Neither browses or
// claims as the primary action, so we drop the 3-tab layout and lead with
// the review queue + posted list. The platform catalog is shown at the
// bottom as a "Browse for ideas" carousel — same cards as students see, but
// tapping opens the read-only detail (claim button is student-only there).

interface PosterBountyViewProps {
  posted: any[];
  postedLoading: boolean;
  refetchPosted: () => void;
  ideas: any[];
  ideasLoading: boolean;
  role: 'parent' | 'observer';
}

function PosterBountyView({ posted, postedLoading, refetchPosted, ideas, ideasLoading, role }: PosterBountyViewProps) {
  const c = useThemeColors();
  const studentNoun = role === 'observer' ? 'student' : 'kid';
  // Role-aware "how bounties work" explainer at the top of the poster experience.
  // Flatten all "submitted" claims from posted bounties — those are the ones
  // sitting in the parent's review inbox right now.
  const pendingReviews = (posted || []).flatMap((b: any) =>
    ((b.claims || []) as any[])
      .filter((c) => c.status === 'submitted')
      .map((c) => ({ ...c, bounty: b }))
  );

  return (
    <VStack space="md" className="px-5 md:px-8">
      <BountyHowItWorks role={role} />

      {/* Primary action — Post a new bounty. Always visible, not buried in a tab. */}
      <Button
        size="lg"
        onPress={() => router.push('/bounties/create')}
        className="w-full"
      >
        <HStack className="items-center gap-2">
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <ButtonText>Post a new bounty</ButtonText>
        </HStack>
      </Button>

      {/* Review queue */}
      <VStack space="sm">
        <HStack className="items-center gap-2">
          <Heading size="md">Needs your review</Heading>
          {pendingReviews.length > 0 && (
            <View className="px-2 py-0.5 rounded-full bg-amber-100">
              <UIText size="xs" className="text-amber-800 font-poppins-semibold">
                {pendingReviews.length}
              </UIText>
            </View>
          )}
        </HStack>
        {postedLoading ? (
          <VStack space="sm">{[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</VStack>
        ) : pendingReviews.length > 0 ? (
          <VStack space="sm">
            {pendingReviews.map((claim: any) => {
              const studentName = claim.student?.display_name
                || `${claim.student?.first_name || ''} ${claim.student?.last_name || ''}`.trim()
                || 'Student';
              const submittedAt = claim.submitted_at || claim.created_at;
              return (
                <Pressable key={claim.id} onPress={() => router.push(`/bounties/review/${claim.bounty.id}`)}>
                  <Card variant="elevated" size="md" className="border-l-4 border-amber-400">
                    <HStack className="items-center gap-3">
                      <View className="w-9 h-9 rounded-full bg-amber-100 items-center justify-center">
                        <Ionicons name="time-outline" size={18} color="#B45309" />
                      </View>
                      <VStack className="flex-1 min-w-0">
                        <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>
                          {studentName}
                        </UIText>
                        <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={1}>
                          {claim.bounty.title}
                        </UIText>
                        {submittedAt && (
                          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                            Submitted {new Date(submittedAt).toLocaleDateString()}
                          </UIText>
                        )}
                      </VStack>
                      <Ionicons name="chevron-forward" size={18} color={c.iconMuted} />
                    </HStack>
                  </Card>
                </Pressable>
              );
            })}
          </VStack>
        ) : (
          <Card variant="filled" size="md" className="items-center py-6">
            <Ionicons name="checkmark-circle-outline" size={32} color={c.iconMuted} />
            <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-2 font-poppins-medium">
              All caught up
            </UIText>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-1">
              No submissions waiting for review.
            </UIText>
          </Card>
        )}
      </VStack>

      {/* Posted bounties — full list with edit/delete affordances. */}
      <VStack space="sm">
        <Heading size="md">Posted by you</Heading>
        {postedLoading ? (
          <VStack space="sm">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</VStack>
        ) : posted.length > 0 ? (
          <VStack space="sm">
            {posted.map((b: any) => {
              const claimsCount = (b.claims || []).length;
              const pendingCount = (b.claims || []).filter((c: any) => c.status === 'submitted').length;
              return (
                <Pressable key={b.id} onPress={() => router.push(`/bounties/review/${b.id}`)}>
                  <Card variant="outline" size="md">
                    <VStack space="sm">
                      <HStack className="items-center justify-between">
                        <HStack className="items-center gap-2 flex-1 min-w-0">
                          <PillarBadge pillar={b.pillar} size="md" />
                          {pendingCount > 0 && (
                            <View className="bg-amber-50 px-2 py-0.5 rounded-full">
                              <UIText size="xs" className="text-amber-700 font-poppins-semibold">
                                {pendingCount} to review
                              </UIText>
                            </View>
                          )}
                        </HStack>
                        <HStack className="items-center gap-2">
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation?.();
                              router.push(`/bounties/create?edit=${b.id}`);
                            }}
                            hitSlop={6}
                            accessibilityLabel="Edit bounty"
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
                            hitSlop={6}
                            accessibilityLabel="Delete bounty"
                          >
                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                          </Pressable>
                        </HStack>
                      </HStack>
                      <Heading size="sm" numberOfLines={2}>{b.title}</Heading>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                        {claimsCount} claimed
                      </UIText>
                    </VStack>
                  </Card>
                </Pressable>
              );
            })}
          </VStack>
        ) : (
          <Card variant="filled" size="lg" className="items-center py-10">
            <Ionicons name="trophy-outline" size={40} color={c.iconMuted} />
            <Heading size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-3">You haven't posted any bounties</Heading>
            <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-1">
              Post a bounty above to challenge your {studentNoun}s with a real-world task.
            </UIText>
          </Card>
        )}
      </VStack>

      {/* Browse for ideas — platform catalog. Cards show the same content the
          student sees but tapping opens the read-only detail (the claim CTA
          is student-only, so non-students can preview without claiming). */}
      <VStack space="sm">
        <Heading size="md">Browse for ideas</Heading>
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
          Get inspiration from bounties Optio and other families have posted.
        </UIText>
        {ideasLoading ? (
          <VStack space="sm">{[1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</VStack>
        ) : ideas.length > 0 ? (
          <VStack space="sm">
            {ideas.slice(0, 8).map((b: any) => (
              <BountyCard key={b.id} bounty={b} />
            ))}
          </VStack>
        ) : (
          <Card variant="filled" size="md" className="items-center py-6">
            <Ionicons name="bulb-outline" size={28} color={c.iconMuted} />
            <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-2">No public bounties to browse yet</UIText>
          </Card>
        )}
      </VStack>
    </VStack>
  );
}

export function BountiesView() {
  const c = useThemeColors();
  const { isDesktop } = useBreakpoint();
  const { user } = useAuthStore();
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  // Honor the superadmin preview-role shell: when previewing as student, the
  // student-only treatment kicks in even though user.role is 'superadmin'.
  // This matches how (tabs)/_layout.tsx resolves observer/parent variants.
  const effectiveRole =
    user?.role === 'superadmin' && previewRole
      ? previewRole
      : (user?.org_role && user?.role === 'org_managed' ? user.org_role : user?.role);
  const isStudent = effectiveRole === 'student';
  // Parents and observers get the same review-queue experience: their JTBD
  // is "approve submissions on bounties I posted" + "post new bounties."
  // Browse-for-ideas is shown at the bottom; neither role can claim.
  const isParent = effectiveRole === 'parent';
  const isObserver = effectiveRole === 'observer';
  const isPoster = isParent || isObserver;
  const canPost = !isStudent;
  // Students see only browse; posters get the review-queue layout.
  const [tab, setTab] = useState<Tab>('browse');

  const { bounties, loading: browsing } = useBounties();
  const { claims, loading: claimsLoading, refetch: refetchClaims } = useMyClaims();
  const { bounties: posted, loading: postedLoading, refetch: refetchPosted } = useMyPosted();

  // Refresh on focus so returning from a bounty detail (after approving/turning
  // in a claim) reflects the new state instead of a stale list — the "I already
  // approved it but it still shows here" report.
  useFocusEffect(
    useCallback(() => {
      refetchClaims();
      refetchPosted();
    }, [refetchClaims, refetchPosted]),
  );

  // Parent + observer route to the dedicated review-queue layout.
  if (isPoster) {
    return (
      <PosterBountyView
        posted={posted}
        postedLoading={postedLoading}
        refetchPosted={refetchPosted}
        ideas={bounties}
        ideasLoading={browsing}
        role={isObserver ? 'observer' : 'parent'}
      />
    );
  }

  // Active = not in a terminal state (not approved, not rejected). These are
  // the claims that show up on the student's Home, so we surface a small
  // "in progress" bridge banner on the catalog instead of a Claims tab.
  const activeClaimCount = claims.filter(
    (c: any) => c.status === 'claimed' || c.status === 'submitted' || c.status === 'revision_requested'
  ).length;

  const tabs: { key: Tab; label: string; count?: number }[] = isStudent
    ? [{ key: 'browse', label: 'Browse' }]
    : [
        { key: 'browse', label: 'Browse' },
        { key: 'claims', label: 'My Claims', count: claims.length || undefined },
        { key: 'posted', label: 'Posted', count: posted.length || undefined },
      ];

  // Swipe between tabs: left -> next, right -> previous (clamped to the ends).
  // Clamp by reading the current tab's index off the tabs array at fire time.
  const goToAdjacentTab = useCallback(
    (direction: 1 | -1) => {
      const idx = tabs.findIndex((t) => t.key === tab);
      const next = idx + direction;
      if (next >= 0 && next < tabs.length) setTab(tabs[next].key);
    },
    [tabs, tab],
  );

  // Only fire on a clearly horizontal fling past the threshold so it doesn't
  // fight the vertical ScrollView/FlatList content.
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-12, 12])
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 60 && Math.abs(e.translationX) > Math.abs(e.translationY)) {
        runOnJS(goToAdjacentTab)(e.translationX < 0 ? 1 : -1);
      }
    });

  return (
    <VStack space="md">
      {/* Role-aware "how bounties work" explainer (student framing here). */}
      <View className="px-5 md:px-8">
        <BountyHowItWorks role={effectiveRole} />
      </View>

      {/* Tab switcher — single-tab layout for students (no chrome). */}
      {tabs.length > 1 && (
        <View className="px-5 md:px-8">
          <HStack className="bg-surface-100 dark:bg-dark-surface-200 rounded-xl p-1" space="xs">
            {tabs.map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                className={`flex-1 py-2.5 rounded-lg items-center ${tab === t.key ? 'bg-white dark:bg-dark-surface-100' : ''}`}
              >
                <HStack className="items-center gap-1">
                  <UIText size="sm" className={tab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>
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
      )}

      <GestureDetector gesture={swipeGesture}>
        <VStack space="md">
      {/* Browse */}
      {tab === 'browse' && (
        <VStack space="md">
          {/* In-progress bridge — only for students with active claims. Light
              touch link routing to Home where the claims actually live. */}
          {isStudent && activeClaimCount > 0 && (
            <View className="px-5 md:px-8">
              <Pressable
                testID="bounty-active-claims-bridge"
                onPress={() => router.push('/(app)/(tabs)/dashboard')}
              >
                <View className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950">
                  <Ionicons name="checkmark-circle-outline" size={18} color={c.isDark ? '#6EE7B7' : '#0F766E'} />
                  <UIText size="sm" className="text-emerald-900 dark:text-emerald-200 flex-1">
                    You have {activeClaimCount} bount{activeClaimCount === 1 ? 'y' : 'ies'} in progress — view on Home
                  </UIText>
                  <Ionicons name="chevron-forward" size={16} color={c.isDark ? '#6EE7B7' : '#0F766E'} />
                </View>
              </Pressable>
            </View>
          )}
          <View className="px-5 md:px-8">
            {browsing ? (
              <VStack space="sm">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</VStack>
            ) : bounties.length > 0 ? (
              <View className={`gap-4 ${isDesktop ? 'flex flex-row flex-wrap' : ''}`}>
                {bounties.map((b: any) => {
                  // Cross-reference the viewer's claims so catalog cards can show
                  // an "In Progress" pill on bounties the student has already
                  // claimed (and switch the CTA to "Continue" / "View status").
                  const myClaim = claims.find((c: any) => c.bounty_id === b.id);
                  return (
                    <View key={b.id} className={isDesktop ? 'w-[calc(50%-8px)]' : ''}>
                      <BountyCard bounty={b} showClaim myClaim={myClaim} />
                    </View>
                  );
                })}
              </View>
            ) : (
              <Card variant="filled" size="lg" className="items-center py-10">
                <Ionicons name="trophy-outline" size={40} color={c.iconMuted} />
                <Heading size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-3">No bounties yet</Heading>
                <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-1 text-center">
                  {isStudent
                    ? 'New challenges show up here — check back soon, or ask a parent or mentor to post one for you.'
                    : 'Check back later for new bounties.'}
                </UIText>
              </Card>
            )}
          </View>
        </VStack>
      )}

      {/* Claims (non-students only) */}
      {tab === 'claims' && (
        <View className="px-5 md:px-8">
          {claimsLoading ? (
            <VStack space="sm">{[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</VStack>
          ) : claims.length > 0 ? (
            <View className={`gap-3 ${isDesktop ? 'flex flex-row flex-wrap' : ''}`}>
              {claims.map((c: any) => (
                <View key={c.id} className={isDesktop ? 'w-[calc(50%-6px)]' : ''}>
                  <ClaimCard claim={c} onTurnedIn={refetchClaims} />
                </View>
              ))}
            </View>
          ) : (
            <Card variant="filled" size="lg" className="items-center py-10">
              <Ionicons name="hand-left-outline" size={40} color={c.iconMuted} />
              <Heading size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-3">No active claims</Heading>
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-1">Start a bounty to get started</UIText>
            </Card>
          )}
        </View>
      )}

      {/* Posted */}
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
            <View className={`gap-3 ${isDesktop ? 'flex flex-row flex-wrap' : ''}`}>
              {posted.map((b: any) => (
                <Pressable
                  key={b.id}
                  onPress={() => router.push(`/bounties/review/${b.id}`)}
                  className={isDesktop ? 'w-[calc(50%-6px)]' : ''}
                >
                  <Card variant="outline" size="md" interactive>
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
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                        {(b.claims || []).length} claimed
                      </UIText>
                    </VStack>
                  </Card>
                </Pressable>
              ))}
            </View>
          ) : (
            <Card variant="filled" size="lg" className="items-center py-10">
              <Ionicons name="create-outline" size={40} color={c.iconMuted} />
              <Heading size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-3">No posted bounties</Heading>
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-1">
                {canPost ? 'Post your first bounty above' : 'Parents and advisors can post bounties'}
              </UIText>
            </Card>
          )}
        </View>
      )}
        </VStack>
      </GestureDetector>
    </VStack>
  );
}
