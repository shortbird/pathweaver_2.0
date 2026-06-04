/**
 * Email Verification - shown after registration.
 *
 * Mobile (native): the app can't open the web confirmation link, so the user
 * types the 6-digit code from the signup email here; verifying logs them
 * straight in. Web: keeps the "open the link in your email" instructions.
 *
 * Route: /(auth)/verify-email?email=...
 */

import React, { useState } from 'react';
import { View, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  VStack, Heading, UIText, Card, Button, ButtonText,
} from '@/src/components/ui';
import { useAuthStore } from '@/src/stores/authStore';
import { authAPI } from '@/src/services/api';
import { landingRouteForUser } from '@/src/services/landingRoute';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const verifyEmailOtp = useAuthStore((s) => s.verifyEmailOtp);
  const c = useThemeColors();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [resendMsg, setResendMsg] = useState('');

  const isWeb = Platform.OS === 'web';

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (trimmed.length < 6 || !email) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await verifyEmailOtp(email, trimmed);
      const user = useAuthStore.getState().user;
      router.replace((landingRouteForUser(user) as any));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'That code is incorrect or expired. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setResendMsg('');
    try {
      await authAPI.resendVerification(email);
      setResendMsg('A new code is on its way. Check your email.');
    } catch {
      setResendMsg('Could not resend right now. Try again in a moment.');
    }
  };

  // ── Web: confirm via the email link ──
  if (isWeb) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50 items-center justify-center px-6">
        <Card variant="elevated" size="lg" className="max-w-md w-full">
          <VStack space="lg" className="items-center py-4">
            <View className="w-16 h-16 rounded-full bg-optio-purple/10 items-center justify-center">
              <Ionicons name="mail-outline" size={32} color="#6D469B" />
            </View>
            <VStack space="sm" className="items-center">
              <Heading size="xl" className="text-center">Check Your Email</Heading>
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
                We sent a verification link to{' '}
                {email ? <UIText size="sm" className="font-poppins-semibold text-typo-700 dark:text-dark-typo-700">{email}</UIText> : 'your email address'}.
              </UIText>
            </VStack>
            <VStack space="xs" className="w-full bg-surface-50 dark:bg-dark-surface-50 rounded-xl p-4">
              <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">1. Open the email from Optio</UIText>
              <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">2. Click the verification link</UIText>
              <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500">3. Return here and sign in</UIText>
            </VStack>
            <Button size="lg" onPress={() => router.replace('/(auth)/login' as any)} className="bg-optio-purple w-full">
              <ButtonText>Go to Login</ButtonText>
            </Button>
          </VStack>
        </Card>
      </SafeAreaView>
    );
  }

  // ── Native: enter the 6-digit code ──
  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50 items-center justify-center px-6">
      <Card variant="elevated" size="lg" className="max-w-md w-full">
        <VStack space="lg" className="items-center py-4">
          <View className="w-16 h-16 rounded-full bg-optio-purple/10 items-center justify-center">
            <Ionicons name="mail-outline" size={32} color="#6D469B" />
          </View>

          <VStack space="sm" className="items-center">
            <Heading size="xl" className="text-center">Enter Your Code</Heading>
            <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
              We emailed a 6-digit code to{' '}
              {email ? <UIText size="sm" className="font-poppins-semibold text-typo-700 dark:text-dark-typo-700">{email}</UIText> : 'your email address'}.
            </UIText>
          </VStack>

          <TextInput
            value={code}
            onChangeText={(t) => { setError(''); setCode(t.replace(/[^0-9]/g, '').slice(0, 6)); }}
            placeholder="000000"
            placeholderTextColor={c.textFaint}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            textAlign="center"
            className="w-full bg-surface-100 dark:bg-dark-surface-200 rounded-xl text-typo dark:text-dark-typo"
            style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 28, letterSpacing: 8, paddingVertical: 14 }}
          />

          {error ? <UIText size="xs" className="text-red-500 text-center">{error}</UIText> : null}

          <Button size="lg" onPress={handleVerify} loading={submitting} disabled={submitting || code.length < 6} className="bg-optio-purple w-full">
            <ButtonText>Verify & Continue</ButtonText>
          </Button>

          <Button size="sm" variant="link" onPress={handleResend}>
            <ButtonText>Resend code</ButtonText>
          </Button>
          {resendMsg ? <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center">{resendMsg}</UIText> : null}

          <Button size="sm" variant="link" onPress={() => router.replace('/(auth)/login' as any)}>
            <ButtonText>Back to Sign In</ButtonText>
          </Button>
        </VStack>
      </Card>
    </SafeAreaView>
  );
}
