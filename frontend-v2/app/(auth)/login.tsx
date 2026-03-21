import React, { useState } from 'react';
import { View, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText,
  Card, Input, InputField, InputSlot, InputIcon, Divider,
} from '@/src/components/ui';

const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png';

export default function LoginScreen() {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    try {
      await login(email.trim(), password);
      router.replace('/(app)/(tabs)/dashboard');
    } catch {
      // Error set in store
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-1 items-center justify-center px-6">
          <VStack className="w-full max-w-sm" space="lg">
            {/* Logo */}
            <View className="items-center mb-4">
              <Image
                source={{ uri: LOGO_URI }}
                className="w-44 h-16"
                resizeMode="contain"
              />
            </View>

            {/* Login Card */}
            <Card variant="elevated" size="lg">
              <VStack space="md">
                <Heading size="lg">Welcome Back</Heading>
                <UIText size="sm" className="text-typo-500">
                  Sign in to continue your learning journey
                </UIText>

                {error && (
                  <View className="bg-red-50 p-3 rounded-lg">
                    <UIText size="sm" className="text-red-600">{error}</UIText>
                  </View>
                )}

                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">Email</UIText>
                  <Input>
                    <InputSlot className="ml-1">
                      <InputIcon as="mail-outline" />
                    </InputSlot>
                    <InputField
                      placeholder="you@email.com"
                      value={email}
                      onChangeText={(t) => { clearError(); setEmail(t); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </Input>
                </VStack>

                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">Password</UIText>
                  <Input>
                    <InputField
                      placeholder="Enter password"
                      value={password}
                      onChangeText={(t) => { clearError(); setPassword(t); }}
                      secureTextEntry={!showPassword}
                    />
                    <InputSlot className="mr-1" onPress={() => setShowPassword(!showPassword)}>
                      <InputIcon as={showPassword ? 'eye-off-outline' : 'eye-outline'} />
                    </InputSlot>
                  </Input>
                </VStack>

                <Button size="lg" className="mt-2" onPress={handleLogin} loading={isLoading}>
                  <ButtonText>Sign In</ButtonText>
                </Button>

                <Button variant="link" size="sm">
                  <ButtonText>Forgot Password?</ButtonText>
                </Button>
              </VStack>
            </Card>
          </VStack>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
