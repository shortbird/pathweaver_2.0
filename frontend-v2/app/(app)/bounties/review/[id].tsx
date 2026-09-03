/**
 * Review Bounty Submissions - For bounty posters (parents/advisors).
 *
 * Shows bounty info + list of submitted claims with approve/reject/revise actions.
 * Includes full evidence preview (images, text, links, videos) per deliverable.
 */

import React, { useState, useRef, useCallback } from 'react';
import { View, ScrollView, Pressable, TextInput, ActivityIndicator, Image, Modal, findNodeHandle, RefreshControl } from 'react-native';
import { safeOpenURL } from '@/src/utils/linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBountyDetail, reviewSubmission } from '@/src/hooks/useBounties';
import { displayImageUrl } from '@/src/services/imageUrl';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { showAlert } from '@/src/utils/alerts';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  PillarBadge, Divider, Avatar, AvatarFallbackText,
} from '@/src/components/ui';

const CLAIM_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  claimed: { label: 'In Progress', bg: '#DBEAFE', text: '#1D4ED8' },
  submitted: { label: 'Awaiting Review', bg: '#FEF3C7', text: '#B45309' },
  approved: { label: 'Approved', bg: '#DCFCE7', text: '#15803D' },
  rejected: { label: 'Rejected', bg: '#FEE2E2', text: '#B91C1C' },
  revision_requested: { label: 'Revision Requested', bg: '#FFEDD5', text: '#C2410C' },
};

/** Renders a single evidence item (text, image, video, link, document). */
function EvidenceItem({ item }: { item: any }) {
  const [imageModal, setImageModal] = useState<string | null>(null);
  const c = useThemeColors();

  if (item.type === 'text') {
    const text = item.content?.text || '';
    if (!text) return null;
    return (
      <View className="bg-surface-50 dark:bg-dark-surface-50 p-3 rounded-lg border border-surface-200 dark:border-dark-surface-300">
        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 italic" numberOfLines={6}>{text}</UIText>
      </View>
    );
  }

  if (item.type === 'image') {
    // Fall back to a single content.url so a screenshot stored without an
    // `items` array still renders (the "screenshot doesn't show here" report).
    const items = item.content?.items?.length
      ? item.content.items
      : (item.content?.url ? [{ url: item.content.url }] : []);
    if (items.length === 0) return null;
    return (
      <>
        <View className="gap-2">
          {items.map((img: any, i: number) => {
            const url = displayImageUrl(img.url);
            if (!url) return null;
            return (
              <Pressable key={i} onPress={() => setImageModal(url)}>
                {/* Full-width, tall preview with `contain` so a screenshot is
                    actually readable; tap opens it fullscreen. */}
                <Image
                  source={{ uri: url }}
                  style={{ width: '100%', height: 320, borderRadius: 10, backgroundColor: c.surfaceMuted }}
                  resizeMode="contain"
                />
              </Pressable>
            );
          })}
        </View>
        {imageModal && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setImageModal(null)}>
            <Pressable
              className="flex-1 items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.9)' }}
              onPress={() => setImageModal(null)}
            >
              <Pressable onPress={() => setImageModal(null)} className="absolute top-12 right-4 z-10 p-2">
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
              <Image
                source={{ uri: imageModal }}
                style={{ width: '92%', height: '70%' }}
                resizeMode="contain"
              />
            </Pressable>
          </Modal>
        )}
      </>
    );
  }

  if (item.type === 'video') {
    const items = item.content?.items || [];
    const videoUrl = items[0]?.url || item.content?.url;
    if (!videoUrl) return null;
    return (
      <Pressable onPress={() => safeOpenURL(videoUrl)}>
        <HStack className="items-center gap-2 bg-surface-50 dark:bg-dark-surface-50 p-3 rounded-lg border border-surface-200 dark:border-dark-surface-300">
          <Ionicons name="videocam" size={20} color={c.brand} />
          <UIText size="sm" className="text-optio-purple font-poppins-medium flex-1" numberOfLines={1}>
            {items[0]?.caption || 'Video evidence'}
          </UIText>
          <Ionicons name="open-outline" size={16} color={c.iconMuted} />
        </HStack>
      </Pressable>
    );
  }

  if (item.type === 'link') {
    const url = item.content?.url || item.content?.items?.[0]?.url;
    if (!url) return null;
    return (
      <Pressable onPress={() => safeOpenURL(url)}>
        <HStack className="items-center gap-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
          <Ionicons name="link" size={18} color="#2563EB" />
          <UIText size="sm" className="text-blue-700 flex-1" numberOfLines={1}>{url}</UIText>
          <Ionicons name="open-outline" size={16} color="#93C5FD" />
        </HStack>
      </Pressable>
    );
  }

  if (item.type === 'document') {
    const url = item.content?.url || item.content?.items?.[0]?.url;
    const filename = item.content?.filename || item.content?.items?.[0]?.filename || 'Document';
    return (
      <Pressable onPress={() => url && safeOpenURL(url)}>
        <HStack className="items-center gap-2 bg-surface-50 dark:bg-dark-surface-50 p-3 rounded-lg border border-surface-200 dark:border-dark-surface-300">
          <Ionicons name="document-text" size={18} color={c.brand} />
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 flex-1" numberOfLines={1}>{filename}</UIText>
          {url && <Ionicons name="open-outline" size={16} color={c.iconMuted} />}
        </HStack>
      </Pressable>
    );
  }

  return null;
}

/** Build a map from deliverable ID to its text label. */
function buildDeliverableMap(deliverables: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  (deliverables || []).forEach((d: any, i: number) => {
    map[d.id] = d.text || `Deliverable ${i + 1}`;
  });
  return map;
}

function ClaimReviewCard({
  claim, bountyId, deliverableMap, onReviewed,
}: {
  claim: any; bountyId: string; deliverableMap: Record<string, string>; onReviewed: () => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const c = useThemeColors();
  const student = claim.student || {};
  const sc = CLAIM_STATUS[claim.status] || CLAIM_STATUS.claimed;
  const completedIds: string[] = claim.evidence?.completed_deliverables || [];
  const deliverableEvidence: Record<string, any[]> = claim.evidence?.deliverable_evidence || {};
  const isSubmitted = claim.status === 'submitted';

  const initials = `${student.first_name?.[0] || ''}${student.last_name?.[0] || ''}`.toUpperCase();

  const handleReview = async (decision: 'approved' | 'rejected' | 'revision_requested') => {
    setSubmitting(true);
    try {
      await reviewSubmission(bountyId, claim.id, decision, feedback.trim() || undefined);
      showAlert(
        decision === 'approved' ? 'Approved' : decision === 'rejected' ? 'Rejected' : 'Revision Requested',
        decision === 'approved' ? 'XP has been awarded to the student.' : 'The student has been notified.',
      );
      onReviewed();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Review failed';
      showAlert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="elevated" size="lg">
      <VStack space="md">
        {/* Student header */}
        <HStack className="items-center justify-between">
          <HStack className="items-center gap-3">
            <Avatar size="sm">
              <AvatarFallbackText>{initials}</AvatarFallbackText>
            </Avatar>
            <VStack>
              <UIText size="sm" className="font-poppins-semibold">
                {student.display_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student'}
              </UIText>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                Claimed {new Date(claim.created_at).toLocaleDateString()}
              </UIText>
            </VStack>
          </HStack>
          <View style={{ backgroundColor: sc.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <UIText size="xs" style={{ color: sc.text, fontFamily: 'Poppins_600SemiBold' }}>{sc.label}</UIText>
          </View>
        </HStack>

        {/* Completed deliverables with evidence */}
        <VStack space="sm">
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">Completed Deliverables</UIText>
          {completedIds.length > 0 ? completedIds.map((dId: string) => {
            const evidence = deliverableEvidence[dId] || [];
            const label = deliverableMap[dId] || dId;
            return (
              <VStack key={dId} space="xs" className="bg-green-50/50 p-3 rounded-xl">
                <HStack className="items-center gap-2">
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                  <UIText size="sm" className="text-green-700 font-poppins-medium flex-1">{label}</UIText>
                </HStack>
                {/* Inline evidence items */}
                {evidence.length > 0 && (
                  <VStack space="xs" className="ml-6 mt-1">
                    {evidence.map((item: any, idx: number) => (
                      <EvidenceItem key={idx} item={item} />
                    ))}
                  </VStack>
                )}
                {evidence.length === 0 && (
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 ml-6">Marked complete (no evidence attached)</UIText>
                )}
              </VStack>
            );
          }) : (
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">No deliverables completed</UIText>
          )}
        </VStack>

        {/* Review actions (only for submitted claims) */}
        {isSubmitted && (
          <>
            <Divider />
            <VStack space="sm">
              <TextInput
                value={feedback}
                onChangeText={setFeedback}
                placeholder="Feedback (optional)"
                placeholderTextColor={c.textFaint}
                multiline
                numberOfLines={2}
                className="bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-3 text-sm font-poppins text-typo dark:text-dark-typo min-h-[60px] border border-surface-200 dark:border-dark-surface-300"
                style={{ textAlignVertical: 'top' }}
              />
              {/* Equal-weight, fully-labeled action buttons. The old layout had
               *  Approve as a primary button, Revise as a faded pill, and
               *  Reject as a tiny red icon-only square — a bad affordance for
               *  irreversible actions. All three are now full-width buttons. */}
              <VStack space="xs">
                <Button
                  size="md"
                  className="w-full"
                  onPress={() => handleReview('approved')}
                  disabled={submitting}
                  loading={submitting}
                  accessibilityLabel="Approve submission"
                >
                  <HStack className="items-center gap-2">
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                    <ButtonText>Approve</ButtonText>
                  </HStack>
                </Button>
                <HStack className="gap-2">
                  <Pressable
                    onPress={() => handleReview('revision_requested')}
                    disabled={submitting}
                    accessibilityLabel="Request revisions"
                    className="flex-1 py-3 rounded-lg border border-amber-300 bg-amber-50 items-center"
                    style={{ opacity: submitting ? 0.5 : 1 }}
                  >
                    <HStack className="items-center gap-2">
                      <Ionicons name="refresh-outline" size={16} color="#B45309" />
                      <UIText size="sm" className="font-poppins-semibold text-amber-800">Request revisions</UIText>
                    </HStack>
                  </Pressable>
                  <Pressable
                    onPress={() => handleReview('rejected')}
                    disabled={submitting}
                    accessibilityLabel="Reject submission"
                    className="flex-1 py-3 rounded-lg border border-red-300 bg-red-50 items-center"
                    style={{ opacity: submitting ? 0.5 : 1 }}
                  >
                    <HStack className="items-center gap-2">
                      <Ionicons name="close-circle-outline" size={16} color="#B91C1C" />
                      <UIText size="sm" className="font-poppins-semibold text-red-700">Reject</UIText>
                    </HStack>
                  </Pressable>
                </HStack>
              </VStack>
            </VStack>
          </>
        )}
      </VStack>
    </Card>
  );
}

/** Move the claim with `targetId` to the front of the list (non-mutating). */
function floatToFront(claims: any[], targetId?: string): any[] {
  if (!targetId) return claims;
  const idx = claims.findIndex((cl: any) => cl.id === targetId);
  if (idx <= 0) return claims;
  const copy = claims.slice();
  const [target] = copy.splice(idx, 1);
  copy.unshift(target);
  return copy;
}

export default function ReviewBountyPage() {
  // `claim` is set when arriving from a "student submitted, needs review"
  // notification — it names the specific submission the poster tapped, which we
  // float to the top of the queue, highlight, and scroll into view.
  const { id, claim: highlightClaimId } = useLocalSearchParams<{ id: string; claim?: string }>();
  const { bounty, loading, refetch } = useBountyDetail(id || null);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  };
  const c = useThemeColors();

  const scrollRef = useRef<ScrollView>(null);
  const highlightRef = useRef<View>(null);
  const didScrollRef = useRef(false);

  // Scroll the highlighted submission into view once it has laid out. measureLayout
  // gives its offset relative to the ScrollView; guarded so it's a no-op in the
  // test renderer (no native layout) and when there's no highlight target.
  const scrollToHighlight = useCallback(() => {
    if (didScrollRef.current) return;
    const node = highlightRef.current;
    const scroller = scrollRef.current;
    if (!node || !scroller) return;
    const handle = findNodeHandle(scroller);
    if (handle == null || typeof node.measureLayout !== 'function') return;
    try {
      node.measureLayout(
        handle,
        (_x: number, y: number) => {
          didScrollRef.current = true;
          scroller.scrollTo({ y: Math.max(0, y - 16), animated: true });
        },
        () => { /* measure failed; leave scroll position untouched */ },
      );
    } catch { /* measureLayout unavailable */ }
  }, []);

  // Render one claim card, wrapped so the highlighted one gets a ring, a testID,
  // and the ref/onLayout used to scroll it into view.
  const renderClaim = useCallback((cl: any, deliverableMap: Record<string, string>) => {
    const highlighted = !!highlightClaimId && cl.id === highlightClaimId;
    return (
      <View
        key={cl.id}
        ref={highlighted ? highlightRef : undefined}
        onLayout={highlighted ? scrollToHighlight : undefined}
        testID={highlighted ? 'highlighted-claim' : undefined}
        className={highlighted ? 'rounded-2xl border-2 border-optio-purple' : undefined}
      >
        <ClaimReviewCard
          claim={cl}
          bountyId={id!}
          deliverableMap={deliverableMap}
          onReviewed={refetch}
        />
      </View>
    );
  }, [highlightClaimId, id, refetch, scrollToHighlight]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50 items-center justify-center">
        <ActivityIndicator size="large" color={c.brand} />
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

  const claims = bounty.claims || [];
  // Float the notification-targeted submission to the front of whichever section
  // holds it (usually "awaiting review"; "all claims" if it was already reviewed).
  // Oldest first: the student who has waited longest is reviewed first.
  const submittedClaims = floatToFront(
    [...claims.filter((c: any) => c.status === 'submitted')]
      .sort((a: any, z: any) => new Date(a.submitted_at || 0).getTime() - new Date(z.submitted_at || 0).getTime()),
    highlightClaimId,
  );
  const otherClaims = floatToFront(claims.filter((c: any) => c.status !== 'submitted'), highlightClaimId);
  const deliverableMap = buildDeliverableMap(bounty.deliverables);

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
      >
        <VStack className="px-5 pt-4 max-w-2xl w-full md:mx-auto" space="lg">

          {/* Back + Edit */}
          <HStack className="items-center justify-between">
            <Pressable onPress={() => router.back()} className="flex-row items-center gap-2">
              <Ionicons name="arrow-back" size={22} color={c.brand} />
              <UIText size="sm" className="text-optio-purple font-poppins-medium">Bounties</UIText>
            </Pressable>
            <Pressable onPress={() => router.push(`/bounties/create?edit=${id}`)} className="flex-row items-center gap-1">
              <Ionicons name="create-outline" size={18} color={c.brand} />
              <UIText size="sm" className="text-optio-purple font-poppins-medium">Edit</UIText>
            </Pressable>
          </HStack>

          {/* Bounty info */}
          <Card variant="elevated" size="lg">
            <VStack space="sm">
              <HStack className="items-center gap-2">
                <PillarBadge pillar={bounty.pillar} size="md" />
                <UIText size="sm" className="font-poppins-bold text-optio-purple">+{bounty.xp_reward} XP</UIText>
              </HStack>
              <Heading size="xl">{bounty.title}</Heading>
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">{bounty.description}</UIText>

              {/* Deliverables list */}
              {(bounty.deliverables || []).length > 0 && (
                <VStack space="xs" className="mt-1">
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">Deliverables</UIText>
                  {bounty.deliverables.map((d: any, i: number) => (
                    <HStack key={d.id} className="items-center gap-2">
                      <View className="w-5 h-5 rounded-full bg-optio-purple/10 items-center justify-center">
                        <UIText size="xs" className="text-optio-purple font-poppins-bold">{i + 1}</UIText>
                      </View>
                      <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">{d.text}</UIText>
                    </HStack>
                  ))}
                </VStack>
              )}

              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                {claims.length} claimed | {submittedClaims.length} awaiting review
              </UIText>
            </VStack>
          </Card>

          {/* Submissions awaiting review */}
          {submittedClaims.length > 0 && (
            <VStack space="sm">
              <Heading size="md">Awaiting Review ({submittedClaims.length})</Heading>
              {submittedClaims.map((claim: any) => renderClaim(claim, deliverableMap))}
            </VStack>
          )}

          {/* Other claims */}
          {otherClaims.length > 0 && (
            <VStack space="sm">
              <Heading size="md">All Claims ({otherClaims.length})</Heading>
              {otherClaims.map((claim: any) => renderClaim(claim, deliverableMap))}
            </VStack>
          )}

          {/* No claims */}
          {claims.length === 0 && (
            <Card variant="filled" size="lg" className="items-center py-10">
              <Ionicons name="hand-left-outline" size={40} color={c.iconMuted} />
              <Heading size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-3">No claims yet</Heading>
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-1">Students haven't claimed this bounty yet.</UIText>
            </Card>
          )}

        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
