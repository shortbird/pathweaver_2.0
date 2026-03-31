/**
 * Email Verification Page - Shown after registration when email needs verification.
 *
 * Route: /(auth)/verify-email?email=...
 */

import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  VStack, Heading, UIText, Card, Button, ButtonText,
} from '@/src/components/ui';

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();

  return (
    <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
      <Card variant="elevated" size="lg" className="max-w-md w-full">
        <VStack space="lg" className="items-center py-4">
          <View className="w-16 h-16 rounded-full bg-optio-purple/10 items-center justify-center">
            <Ionicons name="mail-outline" size={32} color="#6D469B" />
          </View>

          <VStack space="sm" className="items-center">
            <Heading size="xl" className="text-center">Check Your Email</Heading>
            <UIText size="sm" className="text-typo-400 text-center">
              We sent a verification link to{' '}
              {email ? <UIText size="sm" className="font-poppins-semibold text-typo-700">{email}</UIText> : 'your email address'}.
            </UIText>
          </VStack>

          <VStack space="xs" className="w-full bg-surface-50 rounded-xl p-4">
            <UIText size="xs" className="text-typo-500">1. Open the email from Optio Education</UIText>
            <UIText size="xs" className="text-typo-500">2. Click the verification link</UIText>
            <UIText size="xs" className="text-typo-500">3. Return here and sign in</UIText>
          </VStack>

          <UIText size="xs" className="text-typo-300 text-center">
            Did not receive the email? Check your spam folder or try registering again.
          </UIText>

          <Button size="lg" onPress={() => router.replace('/(auth)/login' as any)} className="bg-optio-purple w-full">
            <ButtonText>Go to Login</ButtonText>
          </Button>
        </VStack>
      </Card>
    </SafeAreaView>
  );
}
