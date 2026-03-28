/**
 * Review Bounty Submissions - For bounty posters (parents/advisors).
 *
 * Shows bounty info + list of submitted claims with approve/reject/revise actions.
 * Includes full evidence preview (images, text, links, videos) per deliverable.
 */

import React, { useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, Image, Linking, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBountyDetail, reviewSubmission } from '@/src/hooks/useBounties';
import { displayImageUrl } from '@/src/services/imageUrl';
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

  if (item.type === 'text') {
    const text = item.content?.text || '';
    if (!text) return null;
    return (
      <View className="bg-surface-50 p-3 rounded-lg border border-surface-200">
        <UIText size="sm" className="text-typo-500 italic" numberOfLines={6}>{text}</UIText>
      </View>
    );
  }

  if (item.type === 'image') {
    const items = item.content?.items || [];
    if (items.length === 0) return null;
    return (
      <>
        <View className="flex-row flex-wrap gap-2">
          {items.map((img: any, i: number) => {
            const url = displayImageUrl(img.url);
            if (!url) return null;
            return (
              <Pressable key={i} onPress={() => setImageModal(url)}>
                <Image
                  source={{ uri: url }}
                  style={{ width: 120, height: 90, borderRadius: 8 }}
                  resizeMode="cover"
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
      <Pressable onPress={() => Linking.openURL(videoUrl)}>
        <HStack className="items-center gap-2 bg-surface-50 p-3 rounded-lg border border-surface-200">
          <Ionicons name="videocam" size={20} color="#6D469B" />
          <UIText size="sm" className="text-optio-purple font-poppins-medium flex-1" numberOfLines={1}>
            {items[0]?.caption || 'Video evidence'}
          </UIText>
          <Ionicons name="open-outline" size={16} color="#9CA3AF" />
        </HStack>
      </Pressable>
    );
  }

  if (item.type === 'link') {
    const url = item.content?.url || item.content?.items?.[0]?.url;
    if (!url) return null;
    return (
      <Pressable onPress={() => Linking.openURL(url)}>
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
      <Pressable onPress={() => url && Linking.openURL(url)}>
        <HStack className="items-center gap-2 bg-surface-50 p-3 rounded-lg border border-surface-200">
          <Ionicons name="document-text" size={18} color="#6D469B" />
          <UIText size="sm" className="text-typo-600 flex-1" numberOfLines={1}>{filename}</UIText>
          {url && <Ionicons name="open-outline" size={16} color="#9CA3AF" />}
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
      Alert.alert(
        decision === 'approved' ? 'Approved' : decision === 'rejected' ? 'Rejected' : 'Revision Requested',
        decision === 'approved' ? 'XP has been awarded to the student.' : 'The student has been notified.',
      );
      onReviewed();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Review failed';
      Alert.alert('Error', msg);
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
              <UIText size="xs" className="text-typo-400">
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
          <UIText size="xs" className="text-typo-400 font-poppins-medium">Completed Deliverables</UIText>
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
                  <UIText size="xs" className="text-typo-400 ml-6">Marked complete (no evidence attached)</UIText>
                )}
              </VStack>
            );
          }) : (
            <UIText size="xs" className="text-typo-400">No deliverables completed</UIText>
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
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={2}
                className="bg-surface-50 rounded-xl p-3 text-sm font-poppins text-typo min-h-[60px] border border-surface-200"
                style={{ textAlignVertical: 'top' }}
              />
              <HStack className="gap-2">
                <Button
                  size="md"
                  className="flex-1"
                  onPress={() => handleReview('approved')}
                  disabled={submitting}
                  loading={submitting}
                >
                  <ButtonText>Approve</ButtonText>
                </Button>
                <Pressable
                  onPress={() => handleReview('revision_requested')}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-lg bg-amber-50 items-center"
                >
                  <UIText size="sm" className="font-poppins-semibold text-amber-700">Revise</UIText>
                </Pressable>
                <Pressable
                  onPress={() => handleReview('rejected')}
                  disabled={submitting}
                  className="py-3 px-4 rounded-lg bg-red-50 items-center"
                >
                  <Ionicons name="close" size={18} color="#B91C1C" />
                </Pressable>
              </HStack>
            </VStack>
          </>
        )}
      </VStack>
    </Card>
  );
}

export default function ReviewBountyPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { bounty, loading, refetch } = useBountyDetail(id || null);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <ActivityIndicator size="large" color="#6D469B" />
      </SafeAreaView>
    );
  }

  if (!bounty) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-8">
        <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
        <Heading size="lg" className="text-typo-500 mt-4">Bounty not found</Heading>
        <Button size="md" className="mt-4" onPress={() => router.back()}>
          <ButtonText>Go Back</ButtonText>
        </Button>
      </SafeAreaView>
    );
  }

  const claims = bounty.claims || [];
  const submittedClaims = claims.filter((c: any) => c.status === 'submitted');
  const otherClaims = claims.filter((c: any) => c.status !== 'submitted');
  const deliverableMap = buildDeliverableMap(bounty.deliverables);

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <VStack className="px-5 pt-4 max-w-2xl w-full md:mx-auto" space="lg">

          {/* Back + Edit */}
          <HStack className="items-center justify-between">
            <Pressable onPress={() => router.back()} className="flex-row items-center gap-2">
              <Ionicons name="arrow-back" size={22} color="#6D469B" />
              <UIText size="sm" className="text-optio-purple font-poppins-medium">Bounties</UIText>
            </Pressable>
            <Pressable onPress={() => router.push(`/bounties/create?edit=${id}`)} className="flex-row items-center gap-1">
              <Ionicons name="create-outline" size={18} color="#6D469B" />
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
              <UIText size="sm" className="text-typo-500">{bounty.description}</UIText>

              {/* Deliverables list */}
              {(bounty.deliverables || []).length > 0 && (
                <VStack space="xs" className="mt-1">
                  <UIText size="xs" className="text-typo-400 font-poppins-medium">Deliverables</UIText>
                  {bounty.deliverables.map((d: any, i: number) => (
                    <HStack key={d.id} className="items-center gap-2">
                      <View className="w-5 h-5 rounded-full bg-optio-purple/10 items-center justify-center">
                        <UIText size="xs" className="text-optio-purple font-poppins-bold">{i + 1}</UIText>
                      </View>
                      <UIText size="sm" className="text-typo-600">{d.text}</UIText>
                    </HStack>
                  ))}
                </VStack>
              )}

              <UIText size="xs" className="text-typo-400">
                {claims.length} claimed | {submittedClaims.length} awaiting review
              </UIText>
            </VStack>
          </Card>

          {/* Submissions awaiting review */}
          {submittedClaims.length > 0 && (
            <VStack space="sm">
              <Heading size="md">Awaiting Review ({submittedClaims.length})</Heading>
              {submittedClaims.map((claim: any) => (
                <ClaimReviewCard
                  key={claim.id}
                  claim={claim}
                  bountyId={id!}
                  deliverableMap={deliverableMap}
                  onReviewed={refetch}
                />
              ))}
            </VStack>
          )}

          {/* Other claims */}
          {otherClaims.length > 0 && (
            <VStack space="sm">
              <Heading size="md">All Claims ({otherClaims.length})</Heading>
              {otherClaims.map((claim: any) => (
                <ClaimReviewCard
                  key={claim.id}
                  claim={claim}
                  bountyId={id!}
                  deliverableMap={deliverableMap}
                  onReviewed={refetch}
                />
              ))}
            </VStack>
          )}

          {/* No claims */}
          {claims.length === 0 && (
            <Card variant="filled" size="lg" className="items-center py-10">
              <Ionicons name="hand-left-outline" size={40} color="#9CA3AF" />
              <Heading size="sm" className="text-typo-500 mt-3">No claims yet</Heading>
              <UIText size="sm" className="text-typo-400 mt-1">Students haven't claimed this bounty yet.</UIText>
            </Card>
          )}

        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
