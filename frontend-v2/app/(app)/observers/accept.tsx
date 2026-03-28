/**
 * Accept Observer Invitation - handles both link codes and QR scans.
 *
 * Deep linked from: /observers/accept?code=abc-123
 * QR code flow: scan -> extract code -> navigate here with code param
 */

import React, { useState, useEffect } from 'react';
import { View, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import {
  VStack, Heading, UIText, Card, Button, ButtonText,
} from '@/src/components/ui';

export default function AcceptInvitationScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [invitationCode, setInvitationCode] = useState(code || '');
  const [accepting, setAccepting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [studentName, setStudentName] = useState('');

  // Auto-accept if code is provided via deep link
  useEffect(() => {
    if (code) {
      handleAccept(code);
    }
  }, [code]);

  const handleAccept = async (codeToUse?: string) => {
    const finalCode = codeToUse || invitationCode.trim();
    if (!finalCode) return;
    setAccepting(true);
    try {
      const { data } = await api.post('/api/observers/accept', {
        invitation_code: finalCode,
      });
      setSuccess(true);
      setStudentName(data.student?.display_name || 'the student');
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to accept invitation. The code may be invalid or expired.';
      Alert.alert('Error', msg);
    } finally {
      setAccepting(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <View className="flex-1 items-center justify-center px-6">
          <Card variant="elevated" size="lg" className="w-full max-w-sm">
            <VStack space="md" className="items-center">
              <View className="w-16 h-16 rounded-full bg-green-50 items-center justify-center">
                <Ionicons name="checkmark-circle" size={40} color="#16A34A" />
              </View>
              <Heading size="lg">You're Connected!</Heading>
              <UIText size="sm" className="text-typo-500 text-center">
                You can now view {studentName}'s learning activity in your feed.
              </UIText>
              <Button size="lg" className="w-full" onPress={() => router.replace('/(app)/(tabs)/feed')}>
                <ButtonText>Go to Feed</ButtonText>
              </Button>
            </VStack>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <View className="flex-1 items-center justify-center px-6">
        <Card variant="elevated" size="lg" className="w-full max-w-sm">
          <VStack space="md">
            <VStack className="items-center" space="sm">
              <View className="w-14 h-14 rounded-full bg-optio-purple/10 items-center justify-center">
                <Ionicons name="people" size={28} color="#6D469B" />
              </View>
              <Heading size="lg">Accept Invitation</Heading>
              <UIText size="sm" className="text-typo-500 text-center">
                Enter the invitation code to start observing a student's learning journey.
              </UIText>
            </VStack>

            <TextInput
              value={invitationCode}
              onChangeText={setInvitationCode}
              placeholder="Enter invitation code"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              className="bg-surface-50 rounded-xl p-4 text-base text-center"
              style={{ fontFamily: 'Poppins_400Regular', letterSpacing: 1 }}
            />

            <Button
              size="lg"
              onPress={() => handleAccept()}
              loading={accepting}
              disabled={!invitationCode.trim() || accepting}
              className="w-full"
            >
              <ButtonText>Accept Invitation</ButtonText>
            </Button>

            <Button variant="link" size="sm" onPress={() => router.back()}>
              <ButtonText>Cancel</ButtonText>
            </Button>
          </VStack>
        </Card>
      </View>
    </SafeAreaView>
  );
}
