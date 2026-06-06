import React, { useState, useMemo } from 'react';
import { View, Image, KeyboardAvoidingView, Platform, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore, User } from '@/src/stores/authStore';
import { Ionicons } from '@expo/vector-icons';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText,
  Card, Input, InputField, InputSlot, InputIcon,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png';

// PNG, not SVG — RN <Image> can't decode SVG URIs natively. Google's developer
// guidelines bless this PNG for sign-in / sign-up buttons.
const GOOGLE_ICON_URI =
  'https://developers.google.com/identity/images/g-logo.png';

// Native-only system date picker (iOS spinner / Android dialog). Guarded so the
// web bundle — which uses <input type="date"> — never imports the native module.
const DateTimePicker = Platform.OS === 'web'
  ? null
  : require('@react-native-community/datetimepicker').default;

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

// Marketplace partner keys. A parent arriving from the OpenEd Academy tile lands
// here as /signup?partner=opened-academy (or /register?partner=...): we brand the
// page for OEA and tag the new account so it joins the OEA Diploma Plan.
const OEA_PARTNER_KEY = 'opened-academy';

function getRedirectForRole(user: User): string {
  const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
  switch (role) {
    case 'parent': return '/(app)/(tabs)/family';
    case 'advisor':
    case 'org_admin': return Platform.OS === 'web' ? '/(app)/(tabs)/advisor' : '/(app)/(tabs)/dashboard';
    case 'observer': return '/(app)/(tabs)/feed';
    default: return '/(app)/(tabs)/dashboard';
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
  const c = useThemeColors();
  const { register, googleLogin, appleLoginWeb, appleLoginNative, isLoading, error, clearError } = useAuthStore();
  const isWeb = Platform.OS === 'web';
  const isIos = Platform.OS === 'ios';

  // Partner key from the marketplace tile (?partner=opened-academy).
  const { partner } = useLocalSearchParams<{ partner?: string }>();
  const isOEA = partner === OEA_PARTNER_KEY;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  // Parent vs student (13+) signup. The backend defaults platform signups to
  // 'student', so without this a parent's account couldn't manage a family
  // ("new parent can't add a child"). Default to parent — this signup is
  // family-oriented — and OEA is always a parent enrollment.
  const [accountType, setAccountType] = useState<'parent' | 'student'>('parent');

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
        account_type: isOEA ? 'parent' : accountType,
        ...(isOEA ? { program_key: OEA_PARTNER_KEY } : {}),
      });
      const state = useAuthStore.getState();
      if (state.isAuthenticated) {
        // OEA parents go straight into diploma pathway onboarding (PRD 4.1 -> 4.2);
        // everyone else follows the standard role-based redirect.
        const destination = isOEA
          ? '/(app)/oea/welcome'
          : state.user ? getRedirectForRole(state.user) : '/(app)/(tabs)/dashboard';
        router.replace(destination as any);
      } else if (Platform.OS === 'web') {
        // Web confirms via the email link.
        setVerificationSent(true);
      } else {
        // Mobile can't open the web link — confirm with the 6-digit code instead.
        router.replace({ pathname: '/(auth)/verify-email', params: { email: email.trim() } } as any);
      }
    } catch {
      // Error set in store
    }
  };

  // Today's date as max for DOB input
  const today = new Date().toISOString().split('T')[0];

  // Native date-picker helpers. maxDob caps at today; initialDob opens the
  // picker near a plausible birth year so the user isn't scrolling decades.
  const maxDob = useMemo(() => new Date(), []);
  const initialDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 13);
    return d;
  }, []);
  const formatDob = (iso: string) => {
    if (!iso) return '';
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const onDobChange = (event: any, selected?: Date) => {
    // Android shows a one-shot dialog; close it on any result. iOS keeps the
    // inline spinner open until the user taps Done.
    if (Platform.OS === 'android') setShowDobPicker(false);
    if (event?.type === 'dismissed' || !selected) return;
    const y = selected.getFullYear();
    const m = String(selected.getMonth() + 1).padStart(2, '0');
    const dd = String(selected.getDate()).padStart(2, '0');
    clearFieldError('dob');
    setDateOfBirth(`${y}-${m}-${dd}`);
  };

  if (verificationSent) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
        <View className="flex-1 items-center justify-center px-6">
          <VStack className="w-full max-w-sm items-center" space="lg">
            <Image source={{ uri: LOGO_URI }} className="w-44 h-16" resizeMode="contain" />
            <Card variant="elevated" size="lg">
              <VStack space="md" className="items-center">
                <Heading size="lg">Check Your Email</Heading>
                <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 text-center">
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
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
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

            {isOEA && (
              <View className="bg-optio-purple/10 border border-optio-purple/30 p-4 rounded-xl">
                <UIText size="sm" className="font-poppins-semibold text-optio-purple">
                  OpenEd Academy
                </UIText>
                <UIText size="xs" className="text-typo-600 mt-1">
                  Create your parent account to enroll your family. After signup you'll
                  choose a diploma pathway and start tracking credits toward an OpenEd Academy diploma.
                </UIText>
              </View>
            )}

            <Card variant="elevated" size="lg">
              <VStack space="md">
                <Heading size="lg">{isOEA ? 'Create Parent Account' : 'Create Account'}</Heading>
                <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                  {isOEA
                    ? 'Enroll your family in OpenEd Academy'
                    : 'Start your learning journey today'}
                </UIText>

                {/* Account type — parents get the family experience + can add
                    children; students (13+) get their own learner account. OEA
                    is always a parent enrollment, so the picker is hidden. */}
                {!isOEA && (
                  <VStack space="xs">
                    <UIText size="sm" className="font-poppins-medium">I'm signing up as a…</UIText>
                    <HStack className="gap-2">
                      {(['parent', 'student'] as const).map((t) => {
                        const active = accountType === t;
                        return (
                          <Pressable
                            key={t}
                            onPress={() => setAccountType(t)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            className={`flex-1 items-center py-3 rounded-xl border ${active ? 'bg-optio-purple border-optio-purple' : 'bg-surface-50 dark:bg-dark-surface-50 border-surface-200 dark:border-dark-surface-200'}`}
                          >
                            <UIText size="sm" className={active ? 'text-white font-poppins-semibold' : 'font-poppins-medium'}>
                              {t === 'parent' ? 'Parent / Guardian' : 'Student (13+)'}
                            </UIText>
                          </Pressable>
                        );
                      })}
                    </HStack>
                  </VStack>
                )}

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
                        border: fieldErrors.dob ? '1px solid #f87171' : `1px solid ${c.border}`,
                        fontSize: 14,
                        fontFamily: 'Poppins_400Regular, sans-serif',
                        backgroundColor: c.card,
                        color: dateOfBirth ? c.text : c.textFaint,
                      }}
                    />
                  ) : (
                    <>
                      {/* Tapping opens the OS date picker (iOS spinner / Android dialog) */}
                      <Pressable
                        testID="dob-trigger"
                        onPress={() => { clearFieldError('dob'); setShowDobPicker(true); }}
                        className={`flex-row items-center rounded-lg border px-3 py-2.5 bg-white dark:bg-dark-surface-100 ${fieldErrors.dob ? 'border-red-400' : 'border-surface-300 dark:border-dark-surface-300'}`}
                      >
                        <Ionicons name="calendar-outline" size={18} color={c.iconMuted} style={{ marginRight: 8 }} />
                        <UIText size="sm" style={{ color: dateOfBirth ? c.text : c.textFaint }}>
                          {dateOfBirth ? formatDob(dateOfBirth) : 'Select your date of birth'}
                        </UIText>
                      </Pressable>
                      {showDobPicker && DateTimePicker ? (
                        <DateTimePicker
                          value={dateOfBirth ? new Date(`${dateOfBirth}T12:00:00`) : initialDob}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          maximumDate={maxDob}
                          onChange={onDobChange}
                        />
                      ) : null}
                      {Platform.OS === 'ios' && showDobPicker ? (
                        <Button size="sm" variant="outline" onPress={() => setShowDobPicker(false)} className="self-end mt-1">
                          <ButtonText>Done</ButtonText>
                        </Button>
                      ) : null}
                    </>
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
                          <UIText key={rule.label} size="xs" className={passed ? 'text-green-600' : 'text-typo-400 dark:text-dark-typo-400'}>
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
                    acceptedTerms ? 'bg-optio-purple border-optio-purple' : fieldErrors.terms ? 'border-red-400' : 'border-surface-300 dark:border-dark-surface-300'
                  }`}>
                    {acceptedTerms && (
                      <Ionicons name="checkmark" size={14} color="white" />
                    )}
                  </View>
                  <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 flex-1 flex-shrink">
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

                {/* Social register — same matrix as login:
                    Google everywhere, Apple on iOS + web only. */}
                <View className="flex-row items-center my-1">
                  <View className="flex-1 h-px bg-surface-200 dark:bg-dark-surface-300" />
                  <UIText size="sm" className="px-3 text-typo-400 dark:text-dark-typo-400">Or</UIText>
                  <View className="flex-1 h-px bg-surface-200 dark:bg-dark-surface-300" />
                </View>

                <Pressable
                  onPress={googleLogin}
                  disabled={isLoading}
                  className="flex-row items-center justify-center gap-3 px-4 py-3 rounded-lg border border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100 web:cursor-pointer hover:bg-surface-50 active:bg-surface-50 dark:hover:bg-dark-surface-50 dark:active:bg-dark-surface-50"
                  style={{ opacity: isLoading ? 0.5 : 1 }}
                >
                  <Image source={{ uri: GOOGLE_ICON_URI }} style={{ width: 20, height: 20 }} />
                  <UIText className="font-poppins-medium text-typo dark:text-dark-typo">
                    Sign up with Google
                  </UIText>
                </Pressable>

                {(isWeb || isIos) && (
                  <Pressable
                    onPress={isIos ? appleLoginNative : appleLoginWeb}
                    disabled={isLoading}
                    className="flex-row items-center justify-center gap-3 px-4 py-3 rounded-lg bg-black web:cursor-pointer hover:opacity-90 active:opacity-80"
                    style={{ opacity: isLoading ? 0.5 : 1 }}
                    accessibilityLabel="Sign up with Apple"
                  >
                    <Ionicons name="logo-apple" size={20} color="#FFFFFF" style={{ marginTop: -2 }} />
                    <UIText className="font-poppins-medium text-white">
                      Sign up with Apple
                    </UIText>
                  </Pressable>
                )}
              </VStack>
            </Card>
          </VStack>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
