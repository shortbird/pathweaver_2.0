/**
 * Approvals - Pending FERPA portfolio visibility requests for parents to review.
 *
 * FERPA compliance: minors must have parental consent to make their portfolio
 * public. This screen lists pending requests with approve/deny actions.
 */

import React, { useState } from 'react';
import { View, ScrollView, Pressable, Alert, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFerpaApprovals, type FerpaApprovalRequest } from '@/src/hooks/useFerpaApprovals';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText, Skeleton,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ApprovalCard({ request, onApprove, onDeny }: {
  request: FerpaApprovalRequest;
  onApprove: () => Promise<void>;
  onDeny: (reason: string) => Promise<void>;
}) {
  const c = useThemeColors();
  const [responding, setResponding] = useState(false);
  const [denyOpen, setDenyOpen] = useState(false);
  const [denyReason, setDenyReason] = useState('');

  const handleApprove = async () => {
    setResponding(true);
    try {
      await onApprove();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to approve');
    } finally {
      setResponding(false);
    }
  };

  const handleDeny = async () => {
    setResponding(true);
    try {
      await onDeny(denyReason || 'Parent did not approve');
      setDenyOpen(false);
      setDenyReason('');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to deny');
    } finally {
      setResponding(false);
    }
  };

  return (
    <Card variant="outline" size="md" className="bg-amber-50 border-amber-200">
      <VStack space="md">
        <HStack className="items-start gap-3">
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="globe-outline" size={20} color="#B45309" />
          </View>
          <VStack className="flex-1 min-w-0">
            <UIText size="md" style={{ fontFamily: 'Poppins_600SemiBold' }}>
              {request.student_name} wants to make their portfolio public
            </UIText>
            <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-1">
              Requested {formatDate(request.requested_at)}
            </UIText>
            {request.context && (
              <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 mt-1">{request.context}</UIText>
            )}
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 mt-2">
              Approving lets anyone with the link view their achievements and learning evidence.
            </UIText>
          </VStack>
        </HStack>

        <HStack className="gap-2">
          <Button
            size="md"
            variant="outline"
            className="flex-1"
            onPress={() => setDenyOpen(true)}
            disabled={responding}
          >
            <ButtonText>Deny</ButtonText>
          </Button>
          <Button
            size="md"
            className="flex-1"
            onPress={handleApprove}
            disabled={responding}
            loading={responding}
          >
            <ButtonText>{responding ? 'Approving...' : 'Approve'}</ButtonText>
          </Button>
        </HStack>
      </VStack>

      <Modal visible={denyOpen} transparent animationType="none" onRequestClose={() => setDenyOpen(false)}>
        <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setDenyOpen(false)} />
          <View style={{ backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}>
            <View className="w-10 h-1 bg-surface-300 dark:bg-dark-surface-300 rounded-full self-center mb-4" />
            <VStack space="md">
              <Heading size="lg">Deny request</Heading>
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                Optionally explain why so {request.student_name} understands.
              </UIText>
              <TextInput
                value={denyReason}
                onChangeText={setDenyReason}
                placeholder="Reason (optional)"
                placeholderTextColor={c.textFaint}
                className="bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-4 text-base"
                style={{ fontFamily: 'Poppins_400Regular', color: c.text }}
              />
              <Button size="lg" onPress={handleDeny} disabled={responding} loading={responding}>
                <ButtonText>{responding ? 'Denying...' : 'Confirm deny'}</ButtonText>
              </Button>
            </VStack>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Card>
  );
}

export default function ApprovalsScreen() {
  const c = useThemeColors();
  const { requests, loading, respond } = useFerpaApprovals();

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
      <View className="px-5 pt-4 pb-2">
        <HStack className="items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
          >
            <Ionicons name="chevron-back" size={20} color={c.icon} />
          </Pressable>
          <Heading size="xl">Approvals</Heading>
        </HStack>
        <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-2">
          Portfolio visibility requests from your children that need your approval.
        </UIText>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <VStack space="sm">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </VStack>
        ) : requests.length > 0 ? (
          <VStack space="md">
            {requests.map((req) => (
              <ApprovalCard
                key={req.id}
                request={req}
                onApprove={() => respond(req.id, true)}
                onDeny={(reason) => respond(req.id, false, reason)}
              />
            ))}
          </VStack>
        ) : (
          <Card variant="filled" size="lg" className="items-center py-10 mt-4">
            <Ionicons name="checkmark-circle-outline" size={40} color="#16A34A" />
            <Heading size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-3">All caught up</Heading>
            <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-1 text-center">
              No pending approvals right now.
            </UIText>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
