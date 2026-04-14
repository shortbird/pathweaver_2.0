import React, { useState } from 'react';
import { View, Image, KeyboardAvoidingView, Platform, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore, User } from '@/src/stores/authStore';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText,
  Card, Input, InputField, InputSlot, InputIcon, Divider,
} from '@/src/components/ui';

const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png';

const GOOGLE_ICON_URI =
  'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg';

const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

/** Given a user object, return the best post-login route for v2. */
function getRedirectForRole(user: User): string {
  const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;

  switch (role) {
    case 'parent':
      return '/(app)/(tabs)/family';
    case 'advisor':
    case 'org_admin':
      return Platform.OS === 'web' ? '/(app)/(tabs)/advisor' : '/(app)/(tabs)/feed';
    case 'superadmin':
      return Platform.OS === 'web' ? '/(app)/(tabs)/dashboard' : '/(app)/(tabs)/feed';
    case 'observer':
      return '/(app)/(tabs)/feed';
    default:
      // student and anything else
      return Platform.OS === 'web' ? '/(app)/(tabs)/dashboard' : '/(app)/(tabs)/feed';
  }
}

export default function LoginScreen() {
  const { observer_code } = useLocalSearchParams<{ observer_code?: string }>();
  const { login, googleLogin, appleLoginWeb, appleLoginNative, forgotPassword, isLoading, error, clearError } = useAuthStore();
  const isWeb = Platform.OS === 'web';
  const isIos = Platform.OS === 'ios';

  // Store pending observer invitation code
  React.useEffect(() => {
    if (observer_code && Platform.OS === 'web') {
      sessionStorage.setItem('pendingObserverInvitation', observer_code);
    }
  }, [observer_code]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  const validateFields = (): boolean => {
    let valid = true;
    setEmailError('');
    setPasswordError('');

    if (!email.trim()) {
      setEmailError('Email is required');
      valid = false;
    } else if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError('Invalid email address');
      valid = false;
    }

    if (!password.trim()) {
      setPasswordError('Password is required');
      valid = false;
    }

    return valid;
  };

  const handleLogin = async () => {
    if (!validateFields()) return;
    try {
      await login(email.trim(), password);
      const user = useAuthStore.getState().user;

      // Check for pending observer invitation
      if (Platform.OS === 'web') {
        const pendingCode = sessionStorage.getItem('pendingObserverInvitation');
        if (pendingCode) {
          sessionStorage.removeItem('pendingObserverInvitation');
          router.replace(`/(app)/observers/accept?code=${pendingCode}` as any);
          return;
        }
      }

      const destination = user ? getRedirectForRole(user) : '/(app)/(tabs)/feed';
      router.replace(destination as any);
    } catch {
      // Error set in store
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail.trim()) {
      setResetError('Email is required');
      return;
    }
    if (!EMAIL_REGEX.test(resetEmail.trim())) {
      setResetError('Invalid email address');
      return;
    }

    setResetLoading(true);
    setResetError('');
    setResetMessage('');
    try {
      const message = await forgotPassword(resetEmail.trim());
      setResetMessage(message);
    } catch (err: any) {
      setResetError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const openForgotPassword = () => {
    setResetEmail(email); // Pre-fill with login email
    setResetMessage('');
    setResetError('');
    setShowForgotPassword(true);
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
                  <Input className={emailError ? 'border-red-400' : ''}>
                    <InputSlot className="ml-1">
                      <InputIcon as="mail-outline" />
                    </InputSlot>
                    <InputField
                      placeholder="you@email.com"
                      value={email}
                      onChangeText={(t) => { clearError(); setEmailError(''); setEmail(t); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </Input>
                  {emailError ? (
                    <UIText size="xs" className="text-red-500">{emailError}</UIText>
                  ) : null}
                </VStack>

                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">Password</UIText>
                  <Input className={passwordError ? 'border-red-400' : ''}>
                    <InputField
                      placeholder="Enter password"
                      value={password}
                      onChangeText={(t) => { clearError(); setPasswordError(''); setPassword(t); }}
                      secureTextEntry={!showPassword}
                    />
                    <InputSlot className="mr-1" onPress={() => setShowPassword(!showPassword)}>
                      <InputIcon as={showPassword ? 'eye-off-outline' : 'eye-outline'} />
                    </InputSlot>
                  </Input>
                  {passwordError ? (
                    <UIText size="xs" className="text-red-500">{passwordError}</UIText>
                  ) : null}
                </VStack>

                <Button size="lg" className="mt-2" onPress={handleLogin} loading={isLoading}>
                  <ButtonText>Sign In</ButtonText>
                </Button>

                <Button variant="link" size="sm" onPress={openForgotPassword}>
                  <ButtonText>Forgot Password?</ButtonText>
                </Button>

                <Button variant="link" size="sm" onPress={() => router.push('/(auth)/register')}>
                  <ButtonText>Don't have an account? Sign Up</ButtonText>
                </Button>

                {(isWeb || isIos) && (
                  <>
                    <View className="flex-row items-center my-1">
                      <View className="flex-1 h-px bg-surface-200" />
                      <UIText size="sm" className="px-3 text-typo-400">Or continue with</UIText>
                      <View className="flex-1 h-px bg-surface-200" />
                    </View>

                    {isWeb && (
                      <Pressable
                        onPress={googleLogin}
                        disabled={isLoading}
                        className="flex-row items-center justify-center gap-3 px-4 py-3 rounded-lg border border-surface-200 bg-white active:bg-surface-50"
                        style={{ opacity: isLoading ? 0.5 : 1 }}
                      >
                        <Image source={{ uri: GOOGLE_ICON_URI }} style={{ width: 20, height: 20 }} />
                        <UIText className="font-poppins-medium text-typo">
                          Sign in with Google
                        </UIText>
                      </Pressable>
                    )}

                    <Pressable
                      onPress={isIos ? appleLoginNative : appleLoginWeb}
                      disabled={isLoading}
                      className="flex-row items-center justify-center gap-3 px-4 py-3 rounded-lg bg-black active:opacity-80"
                      style={{ opacity: isLoading ? 0.5 : 1 }}
                      accessibilityLabel="Sign in with Apple"
                    >
                      <UIText className="text-white text-[18px]" style={{ fontFamily: Platform.OS === 'web' ? '-apple-system, BlinkMacSystemFont, "San Francisco"' : undefined }}></UIText>
                      <UIText className="font-poppins-medium text-white">
                        Sign in with Apple
                      </UIText>
                    </Pressable>
                  </>
                )}
              </VStack>
            </Card>
          </VStack>
        </View>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal
        visible={showForgotPassword}
        transparent
        animationType="fade"
        onRequestClose={() => setShowForgotPassword(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <Card variant="elevated" size="lg" className="w-full max-w-sm">
            <VStack space="md">
              <Heading size="md">Reset Password</Heading>
              <UIText size="sm" className="text-typo-500">
                Enter your email and we'll send you a link to reset your password.
              </UIText>

              {resetMessage ? (
                <View className="bg-green-50 p-3 rounded-lg">
                  <UIText size="sm" className="text-green-700">{resetMessage}</UIText>
                </View>
              ) : null}

              {resetError ? (
                <View className="bg-red-50 p-3 rounded-lg">
                  <UIText size="sm" className="text-red-600">{resetError}</UIText>
                </View>
              ) : null}

              {!resetMessage && (
                <>
                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">Email</UIText>
                    <Input>
                      <InputSlot className="ml-1">
                        <InputIcon as="mail-outline" />
                      </InputSlot>
                      <InputField
                        placeholder="you@email.com"
                        value={resetEmail}
                        onChangeText={(t) => { setResetError(''); setResetEmail(t); }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </Input>
                  </VStack>

                  <Button size="lg" onPress={handleForgotPassword} loading={resetLoading}>
                    <ButtonText>Send Reset Link</ButtonText>
                  </Button>
                </>
              )}

              <Button variant="link" size="sm" onPress={() => setShowForgotPassword(false)}>
                <ButtonText>{resetMessage ? 'Back to Sign In' : 'Cancel'}</ButtonText>
              </Button>
            </VStack>
          </Card>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
