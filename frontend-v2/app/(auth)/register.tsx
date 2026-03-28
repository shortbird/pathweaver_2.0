import React, { useState, useMemo } from 'react';
import { View, Image, KeyboardAvoidingView, Platform, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore, User } from '@/src/stores/authStore';
import { Ionicons } from '@expo/vector-icons';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText,
  Card, Input, InputField, InputSlot, InputIcon,
} from '@/src/components/ui';

const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png';

const GOOGLE_ICON_URI =
  'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg';

const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

const PASSWORD_RULES = [
  { test: (p: string) => p.length >= 12, label: 'At least 12 characters' },
  { test: (p: string) => /[A-Z]/.test(p), label: 'One uppercase letter' },
  { test: (p: string) => /[a-z]/.test(p), label: 'One lowercase letter' },
  { test: (p: string) => /[0-9]/.test(p), label: 'One number' },
  { test: (p: string) => /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(p), label: 'One special character' },
];

const TERMS_URL = 'https://www.optioeducation.com/terms';
const PRIVACY_URL = 'https://www.optioeducation.com/privacy';

function getRedirectForRole(user: User): string {
  const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
  switch (role) {
    case 'parent': return '/(app)/(tabs)/family';
    case 'advisor':
    case 'org_admin': return Platform.OS === 'web' ? '/(app)/(tabs)/advisor' : '/(app)/(tabs)/feed';
    case 'observer': return '/(app)/(tabs)/feed';
    default: return Platform.OS === 'web' ? '/(app)/(tabs)/dashboard' : '/(app)/(tabs)/feed';
  }
}

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export default function RegisterScreen() {
  const { register, googleLogin, isLoading, error, clearError } = useAuthStore();
  const isWeb = Platform.OS === 'web';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  // Field-level errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isUnder13 = useMemo(() => {
    if (!dateOfBirth || dateOfBirth.length !== 10) return false;
    return calculateAge(dateOfBirth) < 13;
  }, [dateOfBirth]);

  const passwordStrong = useMemo(
    () => PASSWORD_RULES.every(r => r.test(password)),
    [password]
  );

  const clearFieldError = (field: string) => {
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    clearError();
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!firstName.trim()) errors.firstName = 'First name is required';
    if (!lastName.trim()) errors.lastName = 'Last name is required';
    if (!email.trim()) errors.email = 'Email is required';
    else if (!EMAIL_REGEX.test(email.trim())) errors.email = 'Invalid email address';
    if (!dateOfBirth) errors.dob = 'Date of birth is required';
    if (!password) errors.password = 'Password is required';
    else if (!passwordStrong) errors.password = 'Password does not meet requirements';
    if (password !== confirmPassword) errors.confirm = 'Passwords do not match';
    if (!acceptedTerms) errors.terms = 'You must accept the Terms of Service and Privacy Policy';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    if (isUnder13) return;

    try {
      await register({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dateOfBirth,
        acceptedLegalTerms: true,
      });
      const state = useAuthStore.getState();
      if (state.isAuthenticated) {
        const destination = state.user ? getRedirectForRole(state.user) : '/(app)/(tabs)/feed';
        router.replace(destination as any);
      } else {
        setVerificationSent(true);
      }
    } catch {
      // Error set in store
    }
  };

  // Today's date as max for DOB input
  const today = new Date().toISOString().split('T')[0];

  if (verificationSent) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <View className="flex-1 items-center justify-center px-6">
          <VStack className="w-full max-w-sm items-center" space="lg">
            <Image source={{ uri: LOGO_URI }} className="w-44 h-16" resizeMode="contain" />
            <Card variant="elevated" size="lg">
              <VStack space="md" className="items-center">
                <Heading size="lg">Check Your Email</Heading>
                <UIText size="sm" className="text-typo-500 text-center">
                  We sent a verification link to {email}. Please check your inbox to complete registration.
                </UIText>
                <Button size="md" variant="outline" onPress={() => router.replace('/(auth)/login')}>
                  <ButtonText>Back to Sign In</ButtonText>
                </Button>
              </VStack>
            </Card>
          </VStack>
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
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <VStack className="w-full max-w-sm self-center" space="lg">
            <View className="items-center mb-4">
              <Image source={{ uri: LOGO_URI }} className="w-44 h-16" resizeMode="contain" />
            </View>

            <Card variant="elevated" size="lg">
              <VStack space="md">
                <Heading size="lg">Create Account</Heading>
                <UIText size="sm" className="text-typo-500">
                  Start your learning journey today
                </UIText>

                {error && (
                  <View className="bg-red-50 p-3 rounded-lg">
                    <UIText size="sm" className="text-red-600">{error}</UIText>
                  </View>
                )}

                {/* First Name */}
                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">First Name</UIText>
                  <Input className={fieldErrors.firstName ? 'border-red-400' : ''}>
                    <InputSlot className="ml-1">
                      <InputIcon as="person-outline" />
                    </InputSlot>
                    <InputField
                      placeholder="First name"
                      value={firstName}
                      onChangeText={(t) => { clearFieldError('firstName'); setFirstName(t); }}
                      autoCapitalize="words"
                    />
                  </Input>
                  {fieldErrors.firstName ? <UIText size="xs" className="text-red-500">{fieldErrors.firstName}</UIText> : null}
                </VStack>

                {/* Last Name */}
                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">Last Name</UIText>
                  <Input className={fieldErrors.lastName ? 'border-red-400' : ''}>
                    <InputSlot className="ml-1">
                      <InputIcon as="person-outline" />
                    </InputSlot>
                    <InputField
                      placeholder="Last name"
                      value={lastName}
                      onChangeText={(t) => { clearFieldError('lastName'); setLastName(t); }}
                      autoCapitalize="words"
                    />
                  </Input>
                  {fieldErrors.lastName ? <UIText size="xs" className="text-red-500">{fieldErrors.lastName}</UIText> : null}
                </VStack>

                {/* Email */}
                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">Email</UIText>
                  <Input className={fieldErrors.email ? 'border-red-400' : ''}>
                    <InputSlot className="ml-1">
                      <InputIcon as="mail-outline" />
                    </InputSlot>
                    <InputField
                      placeholder="you@email.com"
                      value={email}
                      onChangeText={(t) => { clearFieldError('email'); setEmail(t); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </Input>
                  {fieldErrors.email ? <UIText size="xs" className="text-red-500">{fieldErrors.email}</UIText> : null}
                </VStack>

                {/* Date of Birth */}
                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">Date of Birth</UIText>
                  {isWeb ? (
                    <input
                      type="date"
                      value={dateOfBirth}
                      max={today}
                      onChange={(e) => { clearFieldError('dob'); setDateOfBirth(e.target.value); }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: fieldErrors.dob ? '1px solid #f87171' : '1px solid #e2e8f0',
                        fontSize: 14,
                        fontFamily: 'Poppins_400Regular, sans-serif',
                        backgroundColor: 'white',
                        color: dateOfBirth ? '#1a1a1a' : '#94a3b8',
                      }}
                    />
                  ) : (
                    <Input className={fieldErrors.dob ? 'border-red-400' : ''}>
                      <InputSlot className="ml-1">
                        <InputIcon as="calendar-outline" />
                      </InputSlot>
                      <InputField
                        placeholder="YYYY-MM-DD"
                        value={dateOfBirth}
                        onChangeText={(t) => { clearFieldError('dob'); setDateOfBirth(t); }}
                        keyboardType="numbers-and-punctuation"
                      />
                    </Input>
                  )}
                  {fieldErrors.dob ? <UIText size="xs" className="text-red-500">{fieldErrors.dob}</UIText> : null}

                  {isUnder13 && (
                    <View className="bg-amber-50 border border-amber-300 p-3 rounded-lg mt-1">
                      <UIText size="sm" className="font-poppins-medium text-amber-800">
                        Parent Account Required
                      </UIText>
                      <UIText size="xs" className="text-amber-700 mt-1">
                        Users under 13 cannot create their own account. A parent or guardian must create an account first and add you as a dependent.
                      </UIText>
                    </View>
                  )}
                </VStack>

                {/* Password */}
                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">Password</UIText>
                  <Input className={fieldErrors.password ? 'border-red-400' : ''}>
                    <InputField
                      placeholder="Create a password"
                      value={password}
                      onChangeText={(t) => { clearFieldError('password'); setPassword(t); }}
                      secureTextEntry={!showPassword}
                    />
                    <InputSlot className="mr-1" onPress={() => setShowPassword(!showPassword)}>
                      <InputIcon as={showPassword ? 'eye-off-outline' : 'eye-outline'} />
                    </InputSlot>
                  </Input>
                  {fieldErrors.password ? <UIText size="xs" className="text-red-500">{fieldErrors.password}</UIText> : null}

                  {password.length > 0 && (
                    <VStack space="xs" className="mt-1">
                      {PASSWORD_RULES.map((rule) => {
                        const passed = rule.test(password);
                        return (
                          <UIText key={rule.label} size="xs" className={passed ? 'text-green-600' : 'text-typo-400'}>
                            {passed ? '\u2713' : '\u2022'} {rule.label}
                          </UIText>
                        );
                      })}
                    </VStack>
                  )}
                </VStack>

                {/* Confirm Password */}
                <VStack space="xs">
                  <UIText size="sm" className="font-poppins-medium">Confirm Password</UIText>
                  <Input className={fieldErrors.confirm ? 'border-red-400' : ''}>
                    <InputField
                      placeholder="Re-enter password"
                      value={confirmPassword}
                      onChangeText={(t) => { clearFieldError('confirm'); setConfirmPassword(t); }}
                      secureTextEntry={!showPassword}
                    />
                  </Input>
                  {fieldErrors.confirm ? <UIText size="xs" className="text-red-500">{fieldErrors.confirm}</UIText> : null}
                </VStack>

                {/* Terms of Service */}
                <Pressable
                  onPress={() => { clearFieldError('terms'); setAcceptedTerms(!acceptedTerms); }}
                  className="flex-row items-start gap-3 mt-1"
                >
                  <View className={`w-5 h-5 mt-0.5 rounded border items-center justify-center ${
                    acceptedTerms ? 'bg-optio-purple border-optio-purple' : fieldErrors.terms ? 'border-red-400' : 'border-surface-300'
                  }`}>
                    {acceptedTerms && (
                      <Ionicons name="checkmark" size={14} color="white" />
                    )}
                  </View>
                  <UIText size="xs" className="text-typo-500 flex-1 flex-shrink">
                    I agree to the{' '}
                    <UIText
                      size="xs"
                      className="text-optio-purple underline"
                      onPress={() => Platform.OS === 'web' ? router.push('/terms' as any) : Linking.openURL(TERMS_URL)}
                    >
                      Terms of Service
                    </UIText>
                    {' '}and{' '}
                    <UIText
                      size="xs"
                      className="text-optio-purple underline"
                      onPress={() => Platform.OS === 'web' ? router.push('/privacy' as any) : Linking.openURL(PRIVACY_URL)}
                    >
                      Privacy Policy
                    </UIText>
                  </UIText>
                </Pressable>
                {fieldErrors.terms ? <UIText size="xs" className="text-red-500">{fieldErrors.terms}</UIText> : null}

                <Button
                  size="lg"
                  className="mt-2"
                  onPress={handleRegister}
                  loading={isLoading}
                  disabled={isUnder13}
                  style={isUnder13 ? { opacity: 0.5 } : undefined}
                >
                  <ButtonText>{isUnder13 ? 'Parent account required' : 'Create Account'}</ButtonText>
                </Button>

                <Button variant="link" size="sm" onPress={() => router.replace('/(auth)/login')}>
                  <ButtonText>Already have an account? Sign In</ButtonText>
                </Button>

                {isWeb && (
                  <>
                    <View className="flex-row items-center my-1">
                      <View className="flex-1 h-px bg-surface-200" />
                      <UIText size="sm" className="px-3 text-typo-400">Or</UIText>
                      <View className="flex-1 h-px bg-surface-200" />
                    </View>

                    <Pressable
                      onPress={googleLogin}
                      disabled={isLoading}
                      className="flex-row items-center justify-center gap-3 px-4 py-3 rounded-lg border border-surface-200 bg-white active:bg-surface-50"
                      style={{ opacity: isLoading ? 0.5 : 1 }}
                    >
                      <Image source={{ uri: GOOGLE_ICON_URI }} style={{ width: 20, height: 20 }} />
                      <UIText className="font-poppins-medium text-typo">
                        Sign up with Google
                      </UIText>
                    </Pressable>
                  </>
                )}
              </VStack>
            </Card>
          </VStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
