/**
 * Bounty Detail - Claim bounty, view/complete deliverables, upload evidence, turn in.
 *
 * Students see: bounty info + claim button (unclaimed) or deliverable checklist (claimed).
 * Poster sees: redirect to review page.
 */

import React, { useState, useMemo } from 'react';
import { View, ScrollView, Pressable, Alert, ActivityIndicator, Image, Linking, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { useBountyDetail, useMyClaims, claimBounty, toggleDeliverable, turnInBounty, deleteEvidence } from '@/src/hooks/useBounties';
import { EvidenceUploadSheet } from '@/src/components/bounty/EvidenceUploadSheet';
import { displayImageUrl } from '@/src/services/imageUrl';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  PillarBadge, Divider,
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

  if (items.length === 0) return null;

  return (
    <>
      <VStack space="xs" className="mt-1">
        {items.map((item: any, idx: number) => (
          <HStack key={idx} className="items-start gap-2">
            <View className="flex-1">
              {item.type === 'text' && item.content?.text && (
                <View className="bg-surface-50 p-2.5 rounded-lg border border-surface-200">
                  <UIText size="xs" className="text-typo-500 italic" numberOfLines={3}>{item.content.text}</UIText>
                </View>
              )}
              {item.type === 'image' && (item.content?.items || []).map((img: any, i: number) => {
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
                  if (url) Linking.openURL(url);
                }}>
                  <HStack className="items-center gap-2 bg-surface-50 p-2.5 rounded-lg border border-surface-200">
                    <Ionicons name="videocam" size={16} color="#6D469B" />
                    <UIText size="xs" className="text-optio-purple font-poppins-medium flex-1" numberOfLines={1}>
                      {item.content?.items?.[0]?.caption || 'Video'}
                    </UIText>
                  </HStack>
                </Pressable>
              )}
              {item.type === 'link' && (
                <Pressable onPress={() => Linking.openURL(item.content?.url || item.content?.items?.[0]?.url || '')}>
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
                  if (url) Linking.openURL(url);
                }}>
                  <HStack className="items-center gap-2 bg-surface-50 p-2.5 rounded-lg border border-surface-200">
                    <Ionicons name="document-text" size={14} color="#6D469B" />
                    <UIText size="xs" className="text-typo-600 flex-1" numberOfLines={1}>
                      {item.content?.filename || 'Document'}
                    </UIText>
                  </HStack>
                </Pressable>
              )}
            </View>
            {canDelete && onDelete && (
              <Pressable onPress={() => onDelete(idx)} className="mt-1">
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
            <Pressable onPress={() => setImageModal(null)} className="absolute top-12 right-4 z-10 p-2">
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
  const { user } = useAuthStore();
  const { bounty, loading, refetch } = useBountyDetail(id || null);
  const { claims, refetch: refetchClaims } = useMyClaims();

  const [claiming, setClaiming] = useState(false);
  const [turningIn, setTurningIn] = useState(false);
  const [evidenceTarget, setEvidenceTarget] = useState<{ deliverableId: string; text: string } | null>(null);

  const myClaim = useMemo(
    () => claims.find((c) => c.bounty_id === id),
    [claims, id],
  );

  const isSuperadmin = user?.role === 'superadmin';
  const isPoster = bounty?.poster_id === user?.id;
  const isStudent = user?.role === 'student' || user?.org_role === 'student';
  const isClaimEditable = myClaim && (myClaim.status === 'claimed' || myClaim.status === 'revision_requested');

  const deliverables = bounty?.deliverables || [];
  const completedIds: string[] = myClaim?.evidence?.completed_deliverables || [];
  const deliverableEvidence: Record<string, any[]> = myClaim?.evidence?.deliverable_evidence || {};
  const completedCount = completedIds.length;
  const totalCount = deliverables.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;

  // Poster or superadmin should see review page
  if ((isPoster || isSuperadmin) && bounty) {
    router.replace(`/bounties/review/${id}`);
    return null;
  }

  const handleClaim = async () => {
    if (!id) return;
    setClaiming(true);
    try {
      await claimBounty(id);
      await refetchClaims();
      await refetch();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to claim bounty';
      Alert.alert('Error', msg);
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
      Alert.alert('Submitted', 'Your bounty has been turned in for review.');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to turn in bounty';
      Alert.alert('Error', msg);
    } finally {
      setTurningIn(false);
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
      Alert.alert('Error', msg);
    }
  };

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

  const pillar = bounty.pillar;
  const sc = myClaim ? STATUS_CONFIG[myClaim.status] || STATUS_CONFIG.claimed : null;

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <VStack className="px-5 pt-4" space="lg">

          {/* Back button */}
          <Pressable onPress={() => router.back()} className="flex-row items-center gap-2">
            <Ionicons name="arrow-back" size={22} color="#6D469B" />
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
              <UIText size="sm" className="text-typo-500">{bounty.description}</UIText>

              {/* Rewards */}
              <HStack className="flex-wrap gap-2">
                {(bounty.rewards || []).map((r: any, i: number) => (
                  r.type === 'xp' ? (
                    <HStack key={i} className="items-center gap-1.5 bg-optio-purple/10 px-3 py-1.5 rounded-full">
                      <Ionicons name="star" size={14} color="#6D469B" />
                      <UIText size="sm" className="font-poppins-bold text-optio-purple">+{r.value} XP</UIText>
                      {r.pillar && <PillarBadge pillar={r.pillar} size="sm" />}
                    </HStack>
                  ) : (
                    <View key={i} className="bg-amber-50 px-3 py-1.5 rounded-full">
                      <UIText size="sm" className="font-poppins-medium text-amber-700">{r.text}</UIText>
                    </View>
                  )
                ))}
                {(!bounty.rewards || bounty.rewards.length === 0) && bounty.xp_reward > 0 && (
                  <HStack className="items-center gap-1.5 bg-optio-purple/10 px-3 py-1.5 rounded-full">
                    <Ionicons name="star" size={14} color="#6D469B" />
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
                      Completed! +{bounty.xp_reward} XP earned
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
                  <UIText size="sm" className="text-red-700 text-center">This submission was rejected.</UIText>
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
                </View>
              )}
            </VStack>
          </Card>

          {/* Deliverables section */}
          <VStack space="sm">
            <HStack className="items-center justify-between">
              <Heading size="md">Deliverables</Heading>
              {myClaim && totalCount > 0 && (
                <UIText size="sm" className="text-typo-400">{completedCount}/{totalCount}</UIText>
              )}
            </HStack>

            {/* Progress bar (only when claimed) */}
            {myClaim && totalCount > 0 && (
              <View className="h-2 bg-surface-200 rounded-full overflow-hidden">
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
                          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D5DB' }} />
                        )}
                      </View>

                      {/* Text */}
                      <VStack className="flex-1 min-w-0">
                        <UIText size="sm" className={isCompleted ? 'text-green-700' : 'text-typo-700'}>
                          {d.text}
                        </UIText>
                      </VStack>

                      {/* Upload button */}
                      {isClaimEditable && (
                        <Pressable
                          onPress={() => setEvidenceTarget({ deliverableId: d.id, text: d.text })}
                          className="bg-optio-purple/10 px-3 py-2 rounded-lg"
                        >
                          <HStack className="items-center gap-1">
                            <Ionicons name="cloud-upload-outline" size={16} color="#6D469B" />
                            <UIText size="xs" className="text-optio-purple font-poppins-medium">
                              {isCompleted ? 'Add' : 'Upload'}
                            </UIText>
                          </HStack>
                        </Pressable>
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
              <ButtonText>Claim Bounty</ButtonText>
            </Button>
          )}

          {isClaimEditable && allComplete && (
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
          )}

        </VStack>
      </ScrollView>

      {/* Evidence upload sheet */}
      <EvidenceUploadSheet
        visible={!!evidenceTarget}
        deliverableText={evidenceTarget?.text || ''}
        onClose={() => setEvidenceTarget(null)}
        onSubmit={handleEvidenceSubmit}
      />
    </SafeAreaView>
  );
}
