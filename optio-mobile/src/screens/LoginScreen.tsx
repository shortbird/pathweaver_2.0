/**
 * Login / Register Screen - Email/password auth + Google OAuth.
 *
 * Tabbed sign-in / create account flow with liquid glass aesthetic.
 * Google OAuth uses Supabase as the identity provider.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { tokens, textStyles } from '../theme/tokens';
import { GlassCard } from '../components/common/GlassCard';
import { GlassButton } from '../components/common/GlassButton';
import { GlassBackground } from '../components/common/GlassBackground';
import { useAuthStore } from '../stores/authStore';
import { useNavigation } from '@react-navigation/native';
import { useOnboardingStore } from '../stores/onboardingStore';
import { useThemeStore } from '../stores/themeStore';
import { storage } from '../utils/storage';

type AuthMode = 'login' | 'register';

const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png';

export function LoginScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useThemeStore();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    login,
    register,
    signInWithGoogle,
    acceptTos,
    isLoading,
    error,
    clearError,
    pendingTosToken,
  } = useAuthStore();

  const clearFields = () => {
    clearError();
    setPassword('');
    setConfirmPassword('');
  };

  const switchMode = (newMode: AuthMode) => {
    clearFields();
    setMode(newMode);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    try {
      await login(email.trim(), password);
    } catch {
      // Error set in store
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password.trim() || !firstName.trim() || !lastName.trim()) return;
    if (password !== confirmPassword) {
      useAuthStore.setState({ error: 'Passwords do not match' });
      return;
    }
    if (password.length < 6) {
      useAuthStore.setState({ error: 'Password must be at least 6 characters' });
      return;
    }
    try {
      const result = await register({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      if (result?.emailVerificationRequired) {
        Alert.alert(
          'Check Your Email',
          'We sent a verification link to your email. Please verify to continue.',
        );
      }
    } catch {
      // Error set in store
    }
  };

  const handleGoogle = async () => {
    await signInWithGoogle();
  };

  const handleAcceptTos = async () => {
    await acceptTos();
  };

  // TOS acceptance screen for new Google users
  if (pendingTosToken) {
    return (
      <GlassBackground style={styles.gradient}>
        <View style={styles.tosContent}>
          <Image source={{ uri: LOGO_URI }} style={styles.logo} resizeMode="contain" />
          <GlassCard style={styles.tosCard}>
            <Ionicons name="document-text-outline" size={40} color={colors.primary} />
            <Text style={[styles.tosTitle, { color: colors.text }]}>Welcome to Optio!</Text>
            <Text style={[styles.tosBody, { color: colors.textSecondary }]}>
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </Text>
            <GlassButton
              title="Accept & Continue"
              onPress={handleAcceptTos}
              loading={isLoading}
              size="lg"
              icon="checkmark-circle-outline"
            />
          </GlassCard>
        </View>
      </GlassBackground>
    );
  }

  const isLogin = mode === 'login';
  const canSubmit = isLogin
    ? email.trim() && password.trim()
    : email.trim() && password.trim() && firstName.trim() && lastName.trim() && confirmPassword;

  return (
    <GlassBackground style={styles.gradient}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image source={{ uri: LOGO_URI }} style={styles.logo} resizeMode="contain" />
          </View>

          {/* Mode tabs */}
          <View style={[styles.tabRow, { backgroundColor: colors.glass.background }]}>
            <TouchableOpacity
              style={[styles.tab, isLogin && [styles.tabActive, { backgroundColor: colors.surfaceOpaque }]]}
              onPress={() => switchMode('login')}
            >
              <Text style={[styles.tabText, { color: colors.textMuted }, isLogin && { color: colors.primary, fontFamily: tokens.typography.fonts.semiBold }]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, !isLogin && [styles.tabActive, { backgroundColor: colors.surfaceOpaque }]]}
              onPress={() => switchMode('register')}
            >
              <Text style={[styles.tabText, { color: colors.textMuted }, !isLogin && { color: colors.primary, fontFamily: tokens.typography.fonts.semiBold }]}>Create Account</Text>
            </TouchableOpacity>
          </View>

          {/* Form card */}
          <GlassCard style={styles.formCard}>
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            )}

            {/* Name fields (register only) */}
            {!isLogin && (
              <View style={styles.nameRow}>
                <View style={[styles.inputWrapper, styles.nameInput, { backgroundColor: colors.inputBg, borderColor: colors.glass.border }]}>
                  <Ionicons name="person-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="First name"
                    placeholderTextColor={colors.textMuted}
                    value={firstName}
                    onChangeText={(t) => { setFirstName(t); if (error) clearError(); }}
                    autoCapitalize="words"
                  />
                </View>
                <View style={[styles.inputWrapper, styles.nameInput, { backgroundColor: colors.inputBg, borderColor: colors.glass.border }]}>
                  <TextInput
                    style={[styles.input, { paddingLeft: tokens.spacing.md, color: colors.text }]}
                    placeholder="Last name"
                    placeholderTextColor={colors.textMuted}
                    value={lastName}
                    onChangeText={(t) => { setLastName(t); if (error) clearError(); }}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {/* Email */}
            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.glass.border }]}>
              <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={(t) => { setEmail(t); if (error) clearError(); }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>

            {/* Password */}
            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.glass.border }]}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={(t) => { setPassword(t); if (error) clearError(); }}
                secureTextEntry={!showPassword}
                autoComplete={isLogin ? 'password' : 'new-password'}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Confirm password (register only) */}
            {!isLogin && (
              <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.glass.border }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Confirm password"
                  placeholderTextColor={colors.textMuted}
                  value={confirmPassword}
                  onChangeText={(t) => { setConfirmPassword(t); if (error) clearError(); }}
                  secureTextEntry={!showConfirmPassword}
                  autoComplete="new-password"
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            )}

            {/* Submit button */}
            <GlassButton
              title={isLogin ? 'Sign In' : 'Create Account'}
              onPress={isLogin ? handleLogin : handleRegister}
              loading={isLoading}
              disabled={!canSubmit}
              size="lg"
              icon={isLogin ? 'log-in-outline' : 'person-add-outline'}
            />

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textMuted }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Google sign-in */}
            <TouchableOpacity
              style={[styles.googleButton, { backgroundColor: colors.surfaceOpaque, borderColor: colors.border }]}
              onPress={handleGoogle}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Image
                source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
                style={styles.googleIcon}
                resizeMode="contain"
              />
              <Text style={[styles.googleText, { color: colors.text }]}>Continue with Google</Text>
            </TouchableOpacity>
          </GlassCard>

          {/* Terms notice (register) */}
          {!isLogin && (
            <Text style={[styles.termsText, { color: colors.textMuted }]}>
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </Text>
          )}
        </ScrollView>

        {/* Admin reset button */}
        <TouchableOpacity
          style={styles.resetButton}
          onPress={async () => {
            await storage.deleteItem('has_seen_onboarding');
            useOnboardingStore.setState({ hasSeenOnboarding: false });
          }}
          activeOpacity={0.6}
        >
          <Ionicons name="refresh-outline" size={14} color={colors.textMuted} />
          <Text style={[styles.resetText, { color: colors.textMuted }]}>Reset App</Text>
        </TouchableOpacity>

        {/* Dev: UI Test */}
        <TouchableOpacity
          style={{ alignSelf: 'center', marginTop: 12, paddingVertical: 8, paddingHorizontal: 20, backgroundColor: tokens.colors.primary, borderRadius: 8 }}
          onPress={() => navigation.navigate('UITest')}
        >
          <Text style={{ color: '#fff', fontFamily: tokens.typography.fonts.semiBold, fontSize: 14 }}>UI Test (Dev)</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.xl,
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: tokens.spacing.lg,
  },
  logo: {
    width: 180,
    height: 64,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginBottom: tokens.spacing.md,
    borderRadius: tokens.radius.xl,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: tokens.spacing.sm + 2,
    alignItems: 'center',
    borderRadius: tokens.radius.xl - 2,
  },
  tabActive: {
    ...tokens.shadows.sm,
  },
  tabText: {
    fontFamily: tokens.typography.fonts.medium,
    fontSize: tokens.typography.sizes.sm,
  },

  // Form
  formCard: {},
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: tokens.spacing.sm,
    borderRadius: tokens.radius.sm,
  },
  errorText: {
    ...textStyles.bodySm,
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  nameInput: {
    flex: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
    marginBottom: tokens.spacing.sm,
  },
  inputIcon: {
    paddingLeft: tokens.spacing.md,
  },
  input: {
    flex: 1,
    padding: tokens.spacing.md,
    fontFamily: tokens.typography.fonts.regular,
    fontSize: tokens.typography.sizes.sm,
  },
  eyeButton: {
    paddingRight: tokens.spacing.md,
    paddingLeft: tokens.spacing.sm,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: tokens.typography.fonts.regular,
    fontSize: tokens.typography.sizes.sm,
  },

  // Google
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.xl,
    paddingVertical: tokens.spacing.sm + 4,
    borderWidth: 0.5,
    ...tokens.shadows.sm,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  googleText: {
    fontFamily: tokens.typography.fonts.medium,
    fontSize: tokens.typography.sizes.md,
  },

  // Terms
  termsText: {
    fontFamily: tokens.typography.fonts.regular,
    fontSize: tokens.typography.sizes.xs,
    textAlign: 'center',
    marginTop: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    lineHeight: 18,
  },

  // TOS acceptance
  tosContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
  },
  tosCard: {
    alignItems: 'center',
    gap: tokens.spacing.md,
    marginTop: tokens.spacing.xl,
    paddingVertical: tokens.spacing.xl,
  },
  tosTitle: {
    ...textStyles.h2,
  },
  tosBody: {
    ...textStyles.body,
    textAlign: 'center',
    lineHeight: 24,
  },

  // Admin reset
  resetButton: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 16 : 32,
    right: tokens.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: tokens.spacing.sm,
    opacity: 0.5,
  },
  resetText: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
  },
});
