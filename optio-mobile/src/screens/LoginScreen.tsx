/**
 * Login Screen - Email/password auth using existing Optio accounts.
 * Liquid Glass aesthetic with gradient background.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { tokens, textStyles } from '../theme/tokens';
import { GlassCard } from '../components/common/GlassCard';
import { GlassButton } from '../components/common/GlassButton';
import { useAuthStore } from '../stores/authStore';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, clearError } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    try {
      await login(email.trim(), password);
    } catch {
      // Error is set in store
    }
  };

  return (
    <LinearGradient
      colors={[tokens.colors.primary + '15', tokens.colors.background, tokens.colors.accent + '08']}
      style={styles.gradient}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[tokens.colors.primary, tokens.colors.accent]}
              style={styles.logoGradient}
            >
              <Ionicons name="sparkles" size={32} color="#FFF" />
            </LinearGradient>
            <Text style={styles.title}>Optio</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>
          </View>

          <GlassCard style={styles.formCard}>
            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={16} color={tokens.colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={tokens.colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={tokens.colors.textMuted}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (error) clearError();
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={tokens.colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={tokens.colors.textMuted}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (error) clearError();
                }}
                secureTextEntry
                autoComplete="password"
              />
            </View>

            <GlassButton
              title="Sign In"
              onPress={handleLogin}
              loading={isLoading}
              disabled={!email.trim() || !password.trim()}
              size="lg"
              icon="log-in-outline"
            />
          </GlassCard>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: tokens.spacing.xl,
  },
  logoGradient: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing.md,
    ...tokens.shadows.lg,
  },
  title: {
    ...textStyles.hero,
    color: tokens.colors.primary,
    marginBottom: tokens.spacing.xs,
  },
  subtitle: {
    ...textStyles.body,
    color: tokens.colors.textSecondary,
  },
  formCard: {
    gap: tokens.spacing.md,
  },
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
    color: tokens.colors.error,
    flex: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderWidth: 0.5,
    borderColor: tokens.colors.glass.border,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  inputIcon: {
    paddingLeft: tokens.spacing.md,
  },
  input: {
    flex: 1,
    padding: tokens.spacing.md,
    fontFamily: tokens.typography.fonts.regular,
    fontSize: tokens.typography.sizes.md,
    color: tokens.colors.text,
  },
});
