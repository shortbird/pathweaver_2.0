/**
 * OAuth Callback Page
 *
 * Handles Google OAuth redirect from Supabase.
 * Captures tokens from URL hash, exchanges for app session, then redirects.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { supabase } from '@/src/services/supabaseClient';
import { UIText } from '@/src/components/ui';
import { hasSeenOnboarding } from '@/src/stores/onboardingStore';

export default function AuthCallbackScreen() {
  const { handleGoogleCallback, handleAppleCallback } = useAuthStore();
  const [status, setStatus] = useState<'processing' | 'error'>('processing');
  const [error, setError] = useState('');
  // Guard against React 18 strict-mode double-fire: each OAuth callback must
  // run exactly once per mount, otherwise the TOS accept + welcome email fire
  // twice for new users (observed: two welcome emails from Apple signup).
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    if (Platform.OS !== 'web') {
      router.replace('/(auth)/login');
      return;
    }

    const processCallback = async () => {
      try {
        // Provider hint is passed via ?provider=apple|google on redirectTo
        const search = new URLSearchParams(window.location.search);
        const provider = (search.get('provider') || 'google') as 'google' | 'apple';

        // Capture tokens from URL hash before Supabase clears them
        const hash = window.location.hash.substring(1);
        let accessToken: string | null = null;
        let refreshToken: string | null = null;

        if (hash && hash.includes('access_token')) {
          const params = new URLSearchParams(hash);
          accessToken = params.get('access_token');
          refreshToken = params.get('refresh_token');
        }

        // If no hash tokens, try to get from Supabase session
        if (!accessToken) {
          if (hash) {
            const params = new URLSearchParams(hash);
            const at = params.get('access_token');
            const rt = params.get('refresh_token');
            if (at) {
              await supabase.auth.setSession({
                access_token: at,
                refresh_token: rt || '',
              });
            }
          }

          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            accessToken = session.access_token;
            refreshToken = session.refresh_token || null;
          }
        }

        if (!accessToken) {
          setError('No authentication data found');
          setStatus('error');
          setTimeout(() => router.replace('/(auth)/login'), 3000);
          return;
        }

        if (provider === 'apple') {
          await handleAppleCallback(accessToken, refreshToken || '');
        } else {
          await handleGoogleCallback(accessToken, refreshToken || '');
        }

        // Decide destination here so there's no race with (app)/_layout.
        // If the user hasn't seen onboarding, go there directly; otherwise feed.
        const userId = useAuthStore.getState().user?.id;
        const seen = userId ? await hasSeenOnboarding(userId) : true;
        router.replace(seen ? '/(app)/(tabs)/feed' : '/(app)/onboarding');
      } catch (err: any) {
        console.error('[AuthCallback] OAuth failed:', err);
        setError(err.message || 'Authentication failed');
        setStatus('error');
        setTimeout(() => router.replace('/(auth)/login'), 3000);
      }
    };

    processCallback();
  }, []);

  return (
    <View className="flex-1 bg-surface-50 items-center justify-center px-6">
      {status === 'processing' && (
        <View className="items-center">
          <ActivityIndicator size="large" color="#7C3AED" />
          <UIText className="mt-4 text-typo-500 font-poppins-medium">
            Completing sign in...
          </UIText>
        </View>
      )}
      {status === 'error' && (
        <View className="items-center">
          <UIText className="text-red-600 font-poppins-medium text-lg">
            Authentication Failed
          </UIText>
          <UIText className="mt-2 text-typo-500">
            {error}
          </UIText>
          <UIText className="mt-4 text-typo-400 text-sm">
            Redirecting to login...
          </UIText>
        </View>
      )}
    </View>
  );
}
