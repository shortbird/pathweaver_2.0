/**
 * Accept Invitation Page - Public page for org invitation links.
 *
 * Route: /invite/:code
 * Validates invitation code, shows org details, handles registration or quick-join.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText,
  Card, Input, InputField, InputSlot,
} from '@/src/components/ui';

interface Invitation {
  email: string;
  invited_name: string;
  role: string;
  organization: { name: string; slug: string; branding_config?: any };
  is_link_based?: boolean;
  is_parent_invitation?: boolean;
  students?: { id: string; first_name: string; last_name: string }[];
}

const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  parent: 'Parent',
  advisor: 'Advisor',
  org_admin: 'Administrator',
  observer: 'Observer',
};

export default function AcceptInvitationScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user, isAuthenticated } = useAuthStore();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dob, setDob] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Email check state
  const [existingAccount, setExistingAccount] = useState(false);
  const [emailChecked, setEmailChecked] = useState(false);

  // Validate invitation on mount
  useEffect(() => {
    if (!code) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get(`/api/admin/organizations/invitations/validate/${code}`);
        if (data.valid) {
          setInvitation(data.invitation);
          if (data.invitation.email) setEmail(data.invitation.email);
          if (data.invitation.invited_name) {
            const parts = data.invitation.invited_name.split(' ');
            setFirstName(parts[0] || '');
            setLastName(parts.slice(1).join(' ') || '');
          }
        } else {
          setError(data.error || 'Invalid invitation');
        }
      } catch (err: any) {
        setError(err.response?.data?.error || 'This invitation is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  // Debounced email check for link-based invitations
  useEffect(() => {
    if (!invitation?.is_link_based || !email) return;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) return;

    const timer = setTimeout(async () => {
      try {
        const { data } = await api.post('/api/admin/organizations/invitations/check-email', {
          email, invitation_code: code,
        });
        setExistingAccount(data.exists);
        setEmailChecked(true);
      } catch { /* non-critical */ }
    }, 500);

    return () => clearTimeout(timer);
  }, [email, invitation?.is_link_based, code]);

  const validate = () => {
    const errors: Record<string, string> = {};
    if (invitation?.is_link_based && !email.trim()) errors.email = 'Email is required';
    if (invitation?.is_link_based && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Invalid email';
    if (!existingAccount && !firstName.trim()) errors.firstName = 'First name is required';
    if (!existingAccount && !lastName.trim()) errors.lastName = 'Last name is required';
    if (!password) errors.password = 'Password is required';
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (!existingAccount && password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/admin/organizations/invitations/accept/${code}`, {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dob || null,
      });
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to accept invitation');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Logged-in user quick join
  const handleLoggedInJoin = async () => {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/admin/organizations/invitations/accept/${code}`, {
        email: user.email,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        skip_password_check: true,
      });
      if (data.success) {
        if (data.existing_user) {
          router.replace('/(app)/(tabs)/dashboard' as any);
        } else {
          setSuccess(true);
        }
      } else {
        setError(data.error || 'Failed to join organization');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to join. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <VStack className="items-center gap-3">
          <ActivityIndicator size="large" color="#6D469B" />
          <UIText className="text-typo-400">Verifying invitation...</UIText>
        </VStack>
      </SafeAreaView>
    );
  }

  // ── Invalid/expired ──
  if (error && !invitation) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Card variant="elevated" size="lg" className="max-w-md w-full">
          <VStack space="md" className="items-center py-4">
            <View className="w-16 h-16 rounded-full bg-red-100 items-center justify-center">
              <Ionicons name="close-circle-outline" size={32} color="#DC2626" />
            </View>
            <Heading size="lg" className="text-center">Invalid Invitation</Heading>
            <UIText size="sm" className="text-typo-400 text-center">{error}</UIText>
            <Button size="md" onPress={() => router.push('/(auth)/login' as any)} className="bg-optio-purple">
              <ButtonText>Go to Login</ButtonText>
            </Button>
          </VStack>
        </Card>
      </SafeAreaView>
    );
  }

  // ── Success ──
  if (success) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Card variant="elevated" size="lg" className="max-w-md w-full">
          <VStack space="md" className="items-center py-4">
            <View className="w-16 h-16 rounded-full bg-green-100 items-center justify-center">
              <Ionicons name="checkmark-circle-outline" size={32} color="#16A34A" />
            </View>
            <Heading size="lg" className="text-center">Welcome!</Heading>
            <UIText size="sm" className="text-typo-500 text-center">
              You've been added to <UIText className="font-poppins-semibold">{invitation?.organization?.name}</UIText> as {ROLE_LABELS[invitation?.role || ''] || invitation?.role}.
            </UIText>
            {invitation?.is_parent_invitation && invitation?.students?.length ? (
              <View className="bg-optio-purple/5 border border-optio-purple/20 rounded-lg p-3 w-full">
                <UIText size="sm" className="text-optio-purple text-center">
                  Connected to: {invitation.students.map(s => `${s.first_name} ${s.last_name}`).join(', ')}
                </UIText>
              </View>
            ) : null}
            <UIText size="sm" className="text-typo-400 text-center">
              {existingAccount ? 'Log in to access your account.' : 'Your account has been created. Log in to get started.'}
            </UIText>
            <Button size="lg" onPress={() => router.push('/(auth)/login' as any)} className="bg-optio-purple w-full">
              <ButtonText>Go to Login</ButtonText>
            </Button>
          </VStack>
        </Card>
      </SafeAreaView>
    );
  }

  // ── Logged-in quick join ──
  if (isAuthenticated && user) {
    const displayName = user.first_name || user.display_name || user.email;
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Card variant="elevated" size="lg" className="max-w-md w-full">
          <VStack space="lg" className="py-4">
            <VStack space="sm" className="items-center">
              <View className="w-14 h-14 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink items-center justify-center">
                <UIText className="text-xl font-bold text-white">
                  {(displayName || '?').charAt(0).toUpperCase()}
                </UIText>
              </View>
              <Heading size="lg" className="text-center">Join {invitation?.organization?.name}</Heading>
              <UIText size="sm" className="text-typo-400 text-center">
                You've been invited as {ROLE_LABELS[invitation?.role || ''] || invitation?.role}.
              </UIText>
            </VStack>

            {invitation?.is_parent_invitation && invitation?.students?.length ? (
              <View className="bg-optio-purple/5 border border-optio-purple/20 rounded-lg p-3">
                <UIText size="sm" className="text-typo-500 text-center">
                  You'll be linked to: {invitation.students.map(s => `${s.first_name} ${s.last_name}`).join(', ')}
                </UIText>
              </View>
            ) : null}

            {error ? (
              <View className="bg-red-50 border border-red-200 rounded-lg p-3">
                <UIText size="sm" className="text-red-700">{error}</UIText>
              </View>
            ) : null}

            <Button size="lg" onPress={handleLoggedInJoin} isDisabled={submitting} className="bg-optio-purple">
              <ButtonText>{submitting ? 'Joining...' : `Join as ${displayName}`}</ButtonText>
            </Button>
          </VStack>
        </Card>
      </SafeAreaView>
    );
  }

  // ── Registration form ──
  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="items-center py-8 px-6" showsVerticalScrollIndicator={false}>
          <Card variant="elevated" size="lg" className="max-w-md w-full">
            <VStack space="lg">
              {/* Header */}
              <VStack space="sm" className="items-center">
                <Heading size="xl" className="text-center">
                  Join {invitation?.organization?.name}
                </Heading>
                <UIText size="sm" className="text-typo-400 text-center">
                  You've been invited as {ROLE_LABELS[invitation?.role || ''] || invitation?.role}.
                  {existingAccount ? ' Enter your password to join.' : ' Create your account below.'}
                </UIText>
              </VStack>

              {invitation?.is_parent_invitation && invitation?.students?.length ? (
                <View className="bg-optio-purple/5 border border-optio-purple/20 rounded-lg p-3">
                  <UIText size="sm" className="text-typo-500 text-center">
                    You'll be linked to: {invitation.students.map(s => `${s.first_name} ${s.last_name}`).join(', ')}
                  </UIText>
                </View>
              ) : null}

              {error ? (
                <View className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <UIText size="sm" className="text-red-700">{error}</UIText>
                </View>
              ) : null}

              {/* Email (editable for link-based, readonly for direct) */}
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Email</UIText>
                <Input variant="outline" size="lg" isInvalid={!!formErrors.email} isReadOnly={!invitation?.is_link_based && !!invitation?.email}>
                  <InputField
                    placeholder="Enter your email"
                    value={email}
                    onChangeText={(t: string) => { setEmail(t); setFormErrors(p => ({ ...p, email: '' })); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </Input>
                {formErrors.email ? <UIText size="xs" className="text-red-600">{formErrors.email}</UIText> : null}
                {emailChecked && existingAccount && (
                  <UIText size="xs" className="text-green-600">Account found -- just enter your password to join.</UIText>
                )}
              </VStack>

              {/* Name fields (skip for existing accounts) */}
              {!existingAccount && (
                <HStack className="gap-3">
                  <VStack space="xs" className="flex-1">
                    <UIText size="sm" className="font-poppins-medium">First name</UIText>
                    <Input variant="outline" size="lg" isInvalid={!!formErrors.firstName}>
                      <InputField
                        placeholder="First name"
                        value={firstName}
                        onChangeText={(t: string) => { setFirstName(t); setFormErrors(p => ({ ...p, firstName: '' })); }}
                      />
                    </Input>
                    {formErrors.firstName ? <UIText size="xs" className="text-red-600">{formErrors.firstName}</UIText> : null}
                  </VStack>
                  <VStack space="xs" className="flex-1">
                    <UIText size="sm" className="font-poppins-medium">Last name</UIText>
                    <Input variant="outline" size="lg" isInvalid={!!formErrors.lastName}>
                      <InputField
                        placeholder="Last name"
                        value={lastName}
                        onChangeText={(t: string) => { setLastName(t); setFormErrors(p => ({ ...p, lastName: '' })); }}
                      />
                    </Input>
                    {formErrors.lastName ? <UIText size="xs" className="text-red-600">{formErrors.lastName}</UIText> : null}
                  </VStack>
                </HStack>
              )}

              {/* Password */}
              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Password</UIText>
                <Input variant="outline" size="lg" isInvalid={!!formErrors.password}>
                  <InputField
                    placeholder={existingAccount ? 'Your existing password' : 'Create a password'}
                    value={password}
                    onChangeText={(t: string) => { setPassword(t); setFormErrors(p => ({ ...p, password: '' })); }}
                    secureTextEntry={!showPassword}
                  />
                  <InputSlot className="mr-3">
                    <Pressable onPress={() => setShowPassword(!showPassword)}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9CA3AF" />
                    </Pressable>
                  </InputSlot>
                </Input>
                {formErrors.password ? <UIText size="xs" className="text-red-600">{formErrors.password}</UIText> : null}
              </VStack>

              {/* Confirm password (new accounts only) */}
              {!existingAccount && (
                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">Confirm password</UIText>
                  <Input variant="outline" size="lg" isInvalid={!!formErrors.confirmPassword}>
                    <InputField
                      placeholder="Confirm your password"
                      value={confirmPassword}
                      onChangeText={(t: string) => { setConfirmPassword(t); setFormErrors(p => ({ ...p, confirmPassword: '' })); }}
                      secureTextEntry={!showPassword}
                    />
                  </Input>
                  {formErrors.confirmPassword ? <UIText size="xs" className="text-red-600">{formErrors.confirmPassword}</UIText> : null}
                </VStack>
              )}

              {/* Date of birth (new accounts only) */}
              {!existingAccount && (
                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">Date of birth <UIText size="xs" className="text-typo-300">(optional)</UIText></UIText>
                  <Input variant="outline" size="lg">
                    <InputField
                      placeholder="YYYY-MM-DD"
                      value={dob}
                      onChangeText={setDob}
                    />
                  </Input>
                </VStack>
              )}

              {/* Submit */}
              <Button size="lg" onPress={handleSubmit} isDisabled={submitting} className="bg-optio-purple">
                <ButtonText>{submitting ? 'Creating account...' : existingAccount ? 'Join Organization' : 'Create Account'}</ButtonText>
              </Button>

              {/* Login link */}
              <Pressable onPress={() => router.push('/(auth)/login' as any)} className="self-center">
                <UIText size="sm" className="text-typo-400">
                  Already have an account?{' '}
                  <UIText size="sm" className="text-optio-purple font-poppins-medium">Sign in</UIText>
                </UIText>
              </Pressable>
            </VStack>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
