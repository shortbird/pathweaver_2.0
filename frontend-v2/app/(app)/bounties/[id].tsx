/**
 * Bounty Detail - Claim bounty, view/complete deliverables, upload evidence, turn in.
 *
 * Students see: bounty info + claim button (unclaimed) or deliverable checklist (claimed).
 * Poster sees: redirect to review page.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Image, Modal, RefreshControl } from 'react-native';
import { safeOpenURL } from '@/src/utils/linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { usePreviewRoleStore } from '@/src/stores/previewRoleStore';
import { useBountyDetail, useMyClaims, claimBounty, abandonBounty, toggleDeliverable, turnInBounty, deleteEvidence } from '@/src/hooks/useBounties';
import { TaskEvidenceSheet } from '@/src/components/capture/TaskEvidenceSheet';
import { displayImageUrl } from '@/src/services/imageUrl';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { showAlert, confirmAlert } from '@/src/utils/alerts';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  PillarBadge,
} from '@/src/components/ui';

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  claimed: { bg: '#DBEAFE', text: '#1D4ED8', label: 'In Progress' },
  submitted: { bg: '#FEF3C7', text: '#B45309', label: 'Submitted' },
  approved: { bg: '#DCFCE7', text: '#15803D', label: 'Approved' },
  rejected: { bg: '#FEE2E2', text: '#B91C1C', label: 'Rejected' },
  revision_requested: { bg: '#FFEDD5', text: '#C2410C', label: 'Revision Needed' },
};

/** Renders evidence items for a deliverable with optional delete. */
function EvidenceList({ items, canDelete, onDelete }: { items: any[]; canDelete: boolean; onDelete?: (index: number) => void }) {
  const [imageModal, setImageModal] = useState<string | null>(null);
  const c = useThemeColors();

  if (items.length === 0) return null;

  return (
    <>
      <VStack space="xs" className="mt-1">
        {items.map((item: any, idx: number) => (
          <HStack key={idx} className="items-start gap-2">
            <View className="flex-1">
              {item.type === 'text' && item.content?.text && (
                <View className="bg-surface-50 dark:bg-dark-surface-50 p-2.5 rounded-lg border border-surface-200 dark:border-dark-surface-300">
                  <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 italic" numberOfLines={3}>{item.content.text}</UIText>
                </View>
              )}
              {item.type === 'image' && (item.content?.items?.length ? item.content.items : (item.content?.url ? [{ url: item.content.url }] : [])).map((img: any, i: number) => {
                const url = displayImageUrl(img.url);
                if (!url) return null;
                return (
                  <Pressable key={i} onPress={() => setImageModal(url)}>
                    <Image source={{ uri: url }} style={{ width: 100, height: 75, borderRadius: 8 }} resizeMode="cover" />
                  </Pressable>
                );
              })}
              {item.type === 'video' && (
                <Pressable onPress={() => {
                  const url = item.content?.items?.[0]?.url || item.content?.url;
                  if (url) safeOpenURL(url);
                }}>
                  <HStack className="items-center gap-2 bg-surface-50 dark:bg-dark-surface-50 p-2.5 rounded-lg border border-surface-200 dark:border-dark-surface-300">
                    <Ionicons name="videocam" size={16} color={c.brand} />
                    <UIText size="xs" className="text-optio-purple font-poppins-medium flex-1" numberOfLines={1}>
                      {item.content?.items?.[0]?.caption || 'Video'}
                    </UIText>
                  </HStack>
                </Pressable>
              )}
              {item.type === 'link' && (
                <Pressable onPress={() => safeOpenURL(item.content?.url || item.content?.items?.[0]?.url || '')}>
                  <HStack className="items-center gap-2 bg-blue-50 p-2.5 rounded-lg">
                    <Ionicons name="link" size={14} color="#2563EB" />
                    <UIText size="xs" className="text-blue-700 flex-1" numberOfLines={1}>
                      {item.content?.url || item.content?.items?.[0]?.url || 'Link'}
                    </UIText>
                  </HStack>
                </Pressable>
              )}
              {item.type === 'document' && (
                <Pressable onPress={() => {
                  const url = item.content?.url || item.content?.items?.[0]?.url;
                  if (url) safeOpenURL(url);
                }}>
                  <HStack className="items-center gap-2 bg-surface-50 dark:bg-dark-surface-50 p-2.5 rounded-lg border border-surface-200 dark:border-dark-surface-300">
                    <Ionicons name="document-text" size={14} color={c.brand} />
                    <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 flex-1" numberOfLines={1}>
                      {item.content?.filename || 'Document'}
                    </UIText>
                  </HStack>
                </Pressable>
              )}
            </View>
            {canDelete && onDelete && (
              <Pressable onPress={() => onDelete(idx)} className="mt-1" accessibilityRole="button" accessibilityLabel="Delete evidence" hitSlop={8}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
            )}
          </HStack>
        ))}
      </VStack>
      {imageModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setImageModal(null)}>
          <Pressable
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
            onPress={() => setImageModal(null)}
          >
            <Pressable onPress={() => setImageModal(null)} className="absolute top-12 right-4 z-10 p-2" accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <Image source={{ uri: imageModal }} style={{ width: '92%', height: '70%' }} resizeMode="contain" />
          </Pressable>
        </Modal>
      )}
    </>
  );
}

export default function BountyDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useThemeColors();
  const { user } = useAuthStore();
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  const { bounty, loading, error, refetch } = useBountyDetail(id || null);
  const { claims, refetch: refetchClaims } = useMyClaims();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchClaims()]);
    setRefreshing(false);
  }, [refetch, refetchClaims]);

  const [claiming, setClaiming] = useState(false);
  const [turningIn, setTurningIn] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [evidenceTarget, setEvidenceTarget] = useState<{ deliverableId: string; text: string } | null>(null);

  const myClaim = useMemo(
    () => claims.find((c) => c.bounty_id === id),
    [claims, id],
  );

  // Resolve the effective role so superadmin previewing as student/parent/etc.
  // stays in the student detail experience instead of being bounced to the
  // poster review page.
  const effectiveRole =
    user?.role === 'superadmin' && previewRole
      ? previewRole
      : (user?.org_role && user?.role === 'org_managed' ? user.org_role : user?.role);
  const isSuperadmin = effectiveRole === 'superadmin';
  const isPoster = bounty?.poster_id === user?.id;
  const isStudent = effectiveRole === 'student';
  const isClaimEditable = myClaim && (myClaim.status === 'claimed' || myClaim.status === 'revision_requested');

  const deliverables = bounty?.deliverables || [];
  const completedIds: string[] = myClaim?.evidence?.completed_deliverables || [];
  const deliverableEvidence: Record<string, any[]> = myClaim?.evidence?.deliverable_evidence || {};
  const completedCount = completedIds.length;
  const totalCount = deliverables.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;

  // Poster or superadmin sees the review page instead of the student detail.
  // Navigation must happen in an effect — calling router.replace() during
  // render trips React's "setState during render" warning. When previewing
  // as another role (superadmin masquerade), we suppress the redirect so
  // the preview is a faithful student-eye view of the page — even if the
  // real user happens to be the bounty's poster.
  const shouldRedirectToReview = !!bounty && (isPoster || isSuperadmin) && !previewRole;
  useEffect(() => {
    if (shouldRedirectToReview) {
      router.replace(`/bounties/review/${id}`);
    }
  }, [shouldRedirectToReview, id]);
  if (shouldRedirectToReview) return null;

  const handleClaim = async () => {
    if (!id) return;
    setClaiming(true);
    try {
      await claimBounty(id);
      await refetchClaims();
      await refetch();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to claim bounty';
      showAlert('Error', msg);
    } finally {
      setClaiming(false);
    }
  };

  const handleTurnIn = async () => {
    if (!id || !myClaim) return;
    setTurningIn(true);
    try {
      await turnInBounty(id, myClaim.id);
      await refetchClaims();
      await refetch();
      showAlert('Submitted', 'Your bounty has been turned in for review.');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to turn in bounty';
      showAlert('Error', msg);
    } finally {
      setTurningIn(false);
    }
  };

  const handleDrop = async () => {
    if (!id || !myClaim) return;
    const confirmed = await confirmAlert({
      title: 'Drop this bounty?',
      message: 'Your progress on this bounty will be removed. You can start it again later.',
      confirmText: 'Drop bounty',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!confirmed) return;
    setDropping(true);
    try {
      await abandonBounty(id, myClaim.id);
      await refetchClaims();
      await refetch();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to drop bounty';
      showAlert('Error', msg);
    } finally {
      setDropping(false);
    }
  };

  const handleUncheck = async (deliverableId: string) => {
    if (!id || !myClaim) return;
    try {
      await toggleDeliverable(id, myClaim.id, deliverableId, false);
      await refetchClaims();
    } catch (err: any) {
      showAlert('Error', err.response?.data?.error || 'Failed to update deliverable');
    }
  };

  const handleEvidenceSubmit = async (evidence: any[]) => {
    if (!id || !myClaim || !evidenceTarget) return;
    await toggleDeliverable(id, myClaim.id, evidenceTarget.deliverableId, true, evidence);
    await refetchClaims();
    await refetch();
  };

  const handleDeleteEvidence = async (deliverableId: string, index: number) => {
    if (!id || !myClaim) return;
    try {
      await deleteEvidence(id, myClaim.id, deliverableId, index);
      await refetchClaims();
      await refetch();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to delete evidence';
      showAlert('Error', msg);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50 items-center justify-center">
        <ActivityIndicator size="large" color={c.brand} />
      </SafeAreaView>
    );
  }

  // A 500/timeout is not "this bounty was deleted" — offer a retry instead of
  // a dead end that reads as the bounty being gone.
  if (!bounty && error) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50 items-center justify-center px-8">
        <Ionicons name="cloud-offline-outline" size={48} color={c.iconMuted} />
        <Heading size="lg" className="text-typo-500 dark:text-dark-typo-500 mt-4">Couldn't load this bounty</Heading>
        <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-1 text-center">
          Check your connection and try again.
        </UIText>
        <Button size="md" className="mt-4" onPress={refetch}>
          <ButtonText>Retry</ButtonText>
        </Button>
        <Pressable onPress={() => router.back()} className="mt-3">
          <UIText size="sm" className="text-optio-purple font-poppins-medium">Go Back</UIText>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!bounty) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50 items-center justify-center px-8">
        <Ionicons name="alert-circle-outline" size={48} color={c.iconMuted} />
        <Heading size="lg" className="text-typo-500 dark:text-dark-typo-500 mt-4">Bounty not found</Heading>
        <Button size="md" className="mt-4" onPress={() => router.back()}>
          <ButtonText>Go Back</ButtonText>
        </Button>
      </SafeAreaView>
    );
  }

  const pillar = bounty.pillar;
  const sc = myClaim ? STATUS_CONFIG[myClaim.status] || STATUS_CONFIG.claimed : null;

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
      >
        <VStack className="px-5 pt-4 max-w-3xl w-full md:mx-auto" space="lg">

          {/* Back button */}
          <Pressable onPress={() => router.back()} className="flex-row items-center gap-2">
            <Ionicons name="arrow-back" size={22} color={c.brand} />
            <UIText size="sm" className="text-optio-purple font-poppins-medium">Bounties</UIText>
          </Pressable>

          {/* Header card */}
          <Card variant="elevated" size="lg">
            <VStack space="md">
              <HStack className="items-center justify-between">
                <PillarBadge pillar={pillar} size="md" />
                {sc && (
                  <View style={{ backgroundColor: sc.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                    <UIText size="xs" style={{ color: sc.text, fontFamily: 'Poppins_600SemiBold' }}>{sc.label}</UIText>
                  </View>
                )}
              </HStack>

              <Heading size="xl">{bounty.title}</Heading>
              {(() => {
                const raw = (bounty as any).deadline;
                if (!raw) return null;
                const dl = new Date(raw);
                if (isNaN(dl.getTime())) return null;
                const past = dl.getTime() < Date.now();
                // A default far-future deadline is noise; only show a real one.
                if (!past && dl.getTime() - Date.now() > 90 * 24 * 60 * 60 * 1000) return null;
                return (
                  <UIText size="xs" className={past ? 'text-red-600' : 'text-typo-400 dark:text-dark-typo-400'}>
                    {past ? 'The deadline for this bounty has passed' : `Ends ${dl.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                  </UIText>
                );
              })()}
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">{bounty.description}</UIText>

              {/* Rewards */}
              <HStack className="flex-wrap gap-2">
                {(bounty.rewards || []).map((r: any, i: number) => (
                  r.type === 'xp' ? (
                    <HStack key={i} className="items-center gap-1.5 bg-optio-purple/10 px-3 py-1.5 rounded-full">
                      <Ionicons name="star" size={14} color={c.brand} />
                      <UIText size="sm" className="font-poppins-bold text-optio-purple">+{r.value} XP</UIText>
                      {r.pillar && <PillarBadge pillar={r.pillar} size="sm" />}
                    </HStack>
                  ) : (
                    // flexShrink keeps a long custom-reward pill inside the
                    // card; the text wraps within the pill instead.
                    <View key={i} className="bg-amber-50 px-3 py-1.5 rounded-full" style={{ flexShrink: 1 }}>
                      <UIText size="sm" className="font-poppins-medium text-amber-700">{r.text}</UIText>
                    </View>
                  )
                ))}
                {(!bounty.rewards || bounty.rewards.length === 0) && bounty.xp_reward > 0 && (
                  <HStack className="items-center gap-1.5 bg-optio-purple/10 px-3 py-1.5 rounded-full">
                    <Ionicons name="star" size={14} color={c.brand} />
                    <UIText size="sm" className="font-poppins-bold text-optio-purple">+{bounty.xp_reward} XP</UIText>
                  </HStack>
                )}
              </HStack>

              {/* Status banners */}
              {myClaim?.status === 'approved' && (
                <View className="bg-green-50 p-3 rounded-xl">
                  <HStack className="items-center gap-2">
                    <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
                    <UIText size="sm" className="font-poppins-bold text-green-700">
                      {bounty.xp_reward > 0
                        ? `Completed! +${bounty.xp_reward} XP earned`
                        : 'Completed! Your reward is on its way'}
                    </UIText>
                  </HStack>
                </View>
              )}
              {myClaim?.status === 'submitted' && (
                <View className="bg-amber-50 p-3 rounded-xl">
                  <UIText size="sm" className="text-amber-700 text-center">Waiting for review from the poster.</UIText>
                </View>
              )}
              {myClaim?.status === 'rejected' && (
                <View className="bg-red-50 p-3 rounded-xl">
                  <UIText size="sm" className="text-red-700 text-center">This submission was not accepted.</UIText>
                  {myClaim.latest_review?.feedback ? (
                    <UIText size="sm" className="text-red-800 text-center mt-1">
                      "{myClaim.latest_review.feedback}"
                    </UIText>
                  ) : null}
                  {bounty.status === 'active' && (
                    <Pressable onPress={handleClaim} disabled={claiming} className="mt-2 items-center">
                      <UIText size="sm" className="text-optio-purple font-poppins-semibold">
                        {claiming ? 'Reopening…' : 'Try this bounty again'}
                      </UIText>
                    </Pressable>
                  )}
                </View>
              )}
              {myClaim?.status === 'revision_requested' && (
                <View className="bg-amber-50 p-3 rounded-xl">
                  <HStack className="items-center gap-2">
                    <Ionicons name="alert-circle" size={20} color="#C2410C" />
                    <UIText size="sm" className="text-amber-800 flex-1">
                      Revision requested. Update your evidence and turn in again.
                    </UIText>
                  </HStack>
                  {myClaim.latest_review?.feedback ? (
                    <UIText size="sm" className="text-amber-900 mt-1.5">
                      Their feedback: {myClaim.latest_review.feedback}
                    </UIText>
                  ) : null}
                </View>
              )}
            </VStack>
          </Card>

          {/* Deliverables section */}
          <VStack space="sm">
            <HStack className="items-center justify-between">
              <Heading size="md">Deliverables</Heading>
              {myClaim && totalCount > 0 && (
                <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">{completedCount}/{totalCount}</UIText>
              )}
            </HStack>

            {/* State-aware student hint: what to do with these deliverables. */}
            {isStudent && !myClaim && bounty.status === 'active' && (
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                Start this bounty, then check off each step with your proof.
              </UIText>
            )}
            {isClaimEditable && (
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                Add proof for each step — a photo, video, link, or a few words.
              </UIText>
            )}

            {/* Progress bar (only when claimed) */}
            {myClaim && totalCount > 0 && (
              <View className="h-2 bg-surface-200 dark:bg-dark-surface-300 rounded-full overflow-hidden">
                <View
                  className="h-full rounded-full bg-optio-purple"
                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                />
              </View>
            )}

            {/* Deliverable items */}
            {deliverables.map((d: any) => {
              const isCompleted = completedIds.includes(d.id);
              const evidence = deliverableEvidence[d.id] || [];

              return (
                <Card key={d.id} variant={isCompleted ? 'filled' : 'outline'} size="md">
                  <VStack space="xs">
                    <HStack className="items-start gap-3">
                      {/* Status icon */}
                      <View className="mt-0.5">
                        {isCompleted ? (
                          <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
                        ) : (
                          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.border }} />
                        )}
                      </View>

                      {/* Text */}
                      <VStack className="flex-1 min-w-0">
                        <UIText size="sm" className={isCompleted ? 'text-green-700' : 'text-typo-700 dark:text-dark-typo-700'}>
                          {d.text}
                        </UIText>
                      </VStack>

                      {/* Upload button */}
                      {isClaimEditable && (
                        <HStack className="items-center gap-1.5">
                          {isCompleted && (
                            <Pressable
                              onPress={() => handleUncheck(d.id)}
                              className="px-2 py-2"
                              accessibilityLabel={`Mark "${d.text}" incomplete`}
                            >
                              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Undo</UIText>
                            </Pressable>
                          )}
                          <Pressable
                            onPress={() => setEvidenceTarget({ deliverableId: d.id, text: d.text })}
                            className="bg-optio-purple/10 px-3 py-2 rounded-lg"
                          >
                            <HStack className="items-center gap-1">
                              <Ionicons name="cloud-upload-outline" size={16} color={c.brand} />
                              <UIText size="xs" className="text-optio-purple font-poppins-medium">
                                {isCompleted ? 'Add' : 'Upload'}
                              </UIText>
                            </HStack>
                          </Pressable>
                        </HStack>
                      )}
                    </HStack>

                    {/* Evidence items inline */}
                    {evidence.length > 0 && (
                      <View className="ml-8">
                        <EvidenceList
                          items={evidence}
                          canDelete={!!isClaimEditable}
                          onDelete={(index) => handleDeleteEvidence(d.id, index)}
                        />
                      </View>
                    )}
                  </VStack>
                </Card>
              );
            })}
          </VStack>

          {/* Action buttons */}
          {!myClaim && isStudent && bounty.status === 'active' && (
            <Button
              size="lg"
              onPress={handleClaim}
              loading={claiming}
              disabled={claiming}
              className="w-full"
            >
              <ButtonText>Start Bounty</ButtonText>
            </Button>
          )}

          {/* Drop a started bounty before turning it in. */}
          {isClaimEditable && (
            <Button
              size="lg"
              variant="outline"
              onPress={handleDrop}
              loading={dropping}
              disabled={dropping}
              className="w-full"
            >
              <ButtonText>{dropping ? 'Dropping…' : 'Drop bounty'}</ButtonText>
            </Button>
          )}

          {isClaimEditable && allComplete && (
            <VStack space="xs">
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center">
                Turning in sends your work for review. You'll get your reward once it's approved.
              </UIText>
              <Button
                size="lg"
                onPress={handleTurnIn}
                loading={turningIn}
                disabled={turningIn}
                className="w-full"
                style={{ backgroundColor: undefined }}
              >
                <View className="w-full py-0.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink">
                  <ButtonText className="text-center">{turningIn ? 'Turning in...' : 'Turn In Bounty'}</ButtonText>
                </View>
              </Button>
            </VStack>
          )}

        </VStack>
      </ScrollView>

      {/* Evidence upload sheet — same component the quest detail uses, with
       *  bounty-specific signed-upload endpoints and a custom save that hands
       *  off to toggleDeliverable. */}
      <TaskEvidenceSheet
        visible={!!evidenceTarget}
        taskTitle={evidenceTarget?.text || ''}
        existingBlocks={
          evidenceTarget ? (deliverableEvidence[evidenceTarget.deliverableId] || []) : []
        }
        uploadInitPath="/api/uploads/sign"
        uploadFinalizePath="/api/uploads/finalize"
        onClose={() => setEvidenceTarget(null)}
        onSave={async (newBlocks) => {
          if (!evidenceTarget || !myClaim || !id) return;
          await handleEvidenceSubmit(newBlocks);
        }}
      />
    </SafeAreaView>
  );
}
