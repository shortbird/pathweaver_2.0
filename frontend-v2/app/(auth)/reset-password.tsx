import React, { useState } from 'react';
import { View, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { authAPI } from '@/src/services/api';
import {
  VStack, Heading, UIText, Button, ButtonText,
  Card, Input, InputField, InputSlot, InputIcon,
} from '@/src/components/ui';

const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png';

const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 12, label: 'At least 12 characters' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'One uppercase letter' },
  { test: (p: string) => /[a-z]/.test(p), label: 'One lowercase letter' },
  { test: (p: string) => /[0-9]/.test(p), label: 'One number' },
  { test: (p: string) => /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(p), label: 'One special character' },
];

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const validatePassword = (): boolean => {
    let valid = true;
    setPasswordError('');
    setConfirmError('');

    const failedRules = PASSWORD_RULES.filter(r => !r.test(password));
    if (failedRules.length > 0) {
      setPasswordError(failedRules[0].label);
      valid = false;
    }

    if (password !== confirmPassword) {
      setConfirmError('Passwords do not match');
      valid = false;
    }

    return valid;
  };

  const handleReset = async () => {
    if (!validatePassword()) return;
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      await authAPI.resetPassword(token, password);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <View className="flex-1 items-center justify-center px-6">
          <Card variant="elevated" size="lg" className="w-full max-w-sm">
            <VStack space="md" className="items-center">
              <Heading size="md">Invalid Reset Link</Heading>
              <UIText size="sm" className="text-typo-500 text-center">
                This password reset link is invalid or has expired. Please request a new one.
              </UIText>
              <Button size="lg" className="w-full" onPress={() => router.replace('/(auth)/login')}>
                <ButtonText>Back to Login</ButtonText>
              </Button>
            </VStack>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-1 items-center justify-center px-6">
          <VStack className="w-full max-w-sm" space="lg">
            <View className="items-center mb-4">
              <Image
                source={{ uri: LOGO_URI }}
                className="w-44 h-16"
                resizeMode="contain"
              />
            </View>

            <Card variant="elevated" size="lg">
              <VStack space="md">
                {success ? (
                  <>
                    <Heading size="lg">Password Reset</Heading>
                    <View className="bg-green-50 p-4 rounded-lg">
                      <UIText size="sm" className="text-green-700">
                        Your password has been successfully reset. You can now sign in with your new password.
                      </UIText>
                    </View>
                    <Button size="lg" onPress={() => router.replace('/(auth)/login')}>
                      <ButtonText>Sign In</ButtonText>
                    </Button>
                  </>
                ) : (
                  <>
                    <Heading size="lg">Set New Password</Heading>
                    <UIText size="sm" className="text-typo-500">
                      Choose a strong password for your account.
                    </UIText>

                    {error ? (
                      <View className="bg-red-50 p-3 rounded-lg">
                        <UIText size="sm" className="text-red-600">{error}</UIText>
                      </View>
                    ) : null}

                    <VStack space="xs">
                      <UIText size="sm" className="font-poppins-medium">New Password</UIText>
                      <Input className={passwordError ? 'border-red-400' : ''}>
                        <InputField
                          placeholder="Enter new password"
                          value={password}
                          onChangeText={(t) => { setPasswordError(''); setError(''); setPassword(t); }}
                          secureTextEntry={!showPassword}
                        />
                        <InputSlot className="mr-1" onPress={() => setShowPassword(!showPassword)}>
                          <InputIcon as={showPassword ? 'eye-off-outline' : 'eye-outline'} />
                        </InputSlot>
                      </Input>
                      {passwordError ? (
                        <UIText size="xs" className="text-red-500">{passwordError}</UIText>
                      ) : null}

                      {/* Password strength indicators */}
                      <VStack space="xs" className="mt-1">
                        {PASSWORD_RULES.map((rule) => {
                          const passed = password.length > 0 && rule.test(password);
                          return (
                            <UIText
                              key={rule.label}
                              size="xs"
                              className={passed ? 'text-green-600' : 'text-typo-400'}
                            >
                              {passed ? '\u2713' : '\u2022'} {rule.label}
                            </UIText>
                          );
                        })}
                      </VStack>
                    </VStack>

                    <VStack space="xs">
                      <UIText size="sm" className="font-poppins-medium">Confirm Password</UIText>
                      <Input className={confirmError ? 'border-red-400' : ''}>
                        <InputField
                          placeholder="Confirm new password"
                          value={confirmPassword}
                          onChangeText={(t) => { setConfirmError(''); setConfirmPassword(t); }}
                          secureTextEntry={!showPassword}
                        />
                      </Input>
                      {confirmError ? (
                        <UIText size="xs" className="text-red-500">{confirmError}</UIText>
                      ) : null}
                    </VStack>

                    <Button size="lg" className="mt-2" onPress={handleReset} loading={isLoading}>
                      <ButtonText>Reset Password</ButtonText>
                    </Button>

                    <Button variant="link" size="sm" onPress={() => router.replace('/(auth)/login')}>
                      <ButtonText>Back to Login</ButtonText>
                    </Button>
                  </>
                )}
              </VStack>
            </Card>
          </VStack>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
