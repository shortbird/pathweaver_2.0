/**
 * Organization Login - Username-based authentication for org students.
 *
 * Route: /(auth)/org-login/:slug
 * Fetches org details by slug, shows branded login form with username/password.
 */

import React, { useState, useEffect } from 'react';
import { View, Image, KeyboardAvoidingView, Platform, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore, User } from '@/src/stores/authStore';
import api from '@/src/services/api';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText,
  Card, Input, InputField, InputSlot, InputIcon,
} from '@/src/components/ui';

function getRedirectForRole(user: User): string {
  const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
  switch (role) {
    case 'parent': return '/(app)/(tabs)/family';
    case 'advisor':
    case 'org_admin': return Platform.OS === 'web' ? '/(app)/(tabs)/advisor' : '/(app)/(tabs)/feed';
    case 'superadmin': return Platform.OS === 'web' ? '/(app)/(tabs)/dashboard' : '/(app)/(tabs)/feed';
    case 'observer': return '/(app)/(tabs)/feed';
    default: return Platform.OS === 'web' ? '/(app)/(tabs)/dashboard' : '/(app)/(tabs)/feed';
  }
}

interface Organization {
  name: string;
  slug: string;
  branding_config?: { logo_url?: string };
}

export default function OrgLoginScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { loginWithUsername, isAuthenticated, user, isLoading: authLoading } = useAuthStore();

  const [org, setOrg] = useState<Organization | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgError, setOrgError] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [wantsToSwitch, setWantsToSwitch] = useState(false);

  // Fetch org details
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        setOrgLoading(true);
        setOrgError('');
        const { data } = await api.get(`/api/organizations/join/${slug}`);
        setOrg(data);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setOrgError('Organization not found. Please check the URL.');
        } else {
          setOrgError('Unable to load organization. Please try again.');
        }
      } finally {
        setOrgLoading(false);
      }
    })();
  }, [slug]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user && !authLoading && !wantsToSwitch) {
      router.replace(getRedirectForRole(user) as any);
    }
  }, [isAuthenticated, user, authLoading, wantsToSwitch]);

  const validate = () => {
    let valid = true;
    setUsernameError('');
    setPasswordError('');
    if (!username.trim()) { setUsernameError('Username is required'); valid = false; }
    if (!password) { setPasswordError('Password is required'); valid = false; }
    return valid;
  };

  const handleLogin = async () => {
    if (!validate() || !slug) return;
    setSubmitting(true);
    setLoginError('');
    try {
      await loginWithUsername(slug, username, password);
      // Redirect handled by the useEffect above
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.response?.data?.error || 'Login failed. Please check your username and password.';
      setLoginError(typeof msg === 'string' ? msg : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (orgLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <ActivityIndicator size="large" color="#6D469B" />
      </SafeAreaView>
    );
  }

  // Org not found
  if (orgError) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Card variant="elevated" size="lg" className="max-w-md w-full">
          <VStack space="md" className="items-center py-4">
            <View className="w-16 h-16 rounded-full bg-red-100 items-center justify-center">
              <Ionicons name="alert-circle-outline" size={32} color="#DC2626" />
            </View>
            <Heading size="lg" className="text-center">{orgError}</Heading>
            <UIText size="sm" className="text-typo-400 text-center">
              If you have an email account, you can sign in with email instead.
            </UIText>
            <Button size="md" variant="outline" onPress={() => router.push('/(auth)/login' as any)}>
              <ButtonText>Sign in with email</ButtonText>
            </Button>
          </VStack>
        </Card>
      </SafeAreaView>
    );
  }

  // Already authenticated -- continue or switch
  if (isAuthenticated && user && !wantsToSwitch) {
    const displayName = user.first_name || user.display_name || user.email;
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Card variant="elevated" size="lg" className="max-w-md w-full">
          <VStack space="lg" className="items-center py-4">
            <View className="w-16 h-16 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink items-center justify-center">
              <UIText className="text-2xl font-bold text-white">
                {(displayName || '?').charAt(0).toUpperCase()}
              </UIText>
            </View>
            <VStack space="xs" className="items-center">
              <Heading size="lg">Welcome back</Heading>
              <UIText className="text-optio-purple font-poppins-semibold">{displayName}</UIText>
            </VStack>
            <VStack space="sm" className="w-full">
              <Button
                size="lg"
                onPress={() => router.replace(getRedirectForRole(user) as any)}
                className="bg-optio-purple"
              >
                <ButtonText>Continue as {displayName}</ButtonText>
              </Button>
              <Button size="lg" variant="outline" onPress={() => setWantsToSwitch(true)}>
                <ButtonText>Sign in with a different account</ButtonText>
              </Button>
            </VStack>
          </VStack>
        </Card>
      </SafeAreaView>
    );
  }

  // Login form
  const logoUrl = org?.branding_config?.logo_url;

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-1 items-center justify-center px-6">
          <Card variant="elevated" size="lg" className="max-w-md w-full">
            <VStack space="lg">
              {/* Org branding */}
              <VStack space="sm" className="items-center">
                {logoUrl ? (
                  <Image
                    source={{ uri: logoUrl }}
                    style={{ width: 120, height: 48 }}
                    resizeMode="contain"
                  />
                ) : (
                  <View className="w-16 h-16 rounded-xl bg-gradient-to-br from-optio-purple to-optio-pink items-center justify-center">
                    <UIText className="text-2xl font-bold text-white">
                      {(org?.name || 'O').charAt(0).toUpperCase()}
                    </UIText>
                  </View>
                )}
                <Heading size="xl" className="text-center">
                  Sign in to {org?.name}
                </Heading>
                <UIText size="sm" className="text-typo-400">
                  Enter your username and password
                </UIText>
              </VStack>

              {wantsToSwitch && (
                <View className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <UIText size="xs" className="text-amber-800">
                    Signing in below will end your current session.
                  </UIText>
                </View>
              )}

              {/* Error */}
              {loginError ? (
                <View className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <UIText size="sm" className="text-red-700">{loginError}</UIText>
                </View>
              ) : null}

              {/* Username field */}
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Username</UIText>
                <Input variant="outline" size="lg" isInvalid={!!usernameError}>
                  <InputSlot className="ml-3">
                    <Ionicons name="person-outline" size={18} color="#9CA3AF" />
                  </InputSlot>
                  <InputField
                    placeholder="Enter your username"
                    value={username}
                    onChangeText={(t: string) => { setUsername(t); setUsernameError(''); setLoginError(''); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </Input>
                {usernameError ? <UIText size="xs" className="text-red-600">{usernameError}</UIText> : null}
              </VStack>

              {/* Password field */}
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Password</UIText>
                <Input variant="outline" size="lg" isInvalid={!!passwordError}>
                  <InputSlot className="ml-3">
                    <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
                  </InputSlot>
                  <InputField
                    placeholder="Enter your password"
                    value={password}
                    onChangeText={(t: string) => { setPassword(t); setPasswordError(''); setLoginError(''); }}
                    secureTextEntry={!showPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <InputSlot className="mr-3">
                    <Pressable onPress={() => setShowPassword(!showPassword)}>
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color="#9CA3AF"
                      />
                    </Pressable>
                  </InputSlot>
                </Input>
                {passwordError ? <UIText size="xs" className="text-red-600">{passwordError}</UIText> : null}
              </VStack>

              {/* Submit */}
              <Button
                size="lg"
                onPress={handleLogin}
                isDisabled={submitting}
                className="bg-optio-purple"
              >
                <ButtonText>{submitting ? 'Signing in...' : 'Sign in'}</ButtonText>
              </Button>

              {/* Email login link */}
              <Pressable onPress={() => router.push('/(auth)/login' as any)} className="self-center">
                <UIText size="sm" className="text-typo-400">
                  Have an email account?{' '}
                  <UIText size="sm" className="text-optio-purple font-poppins-medium">
                    Sign in with email
                  </UIText>
                </UIText>
              </Pressable>
            </VStack>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
