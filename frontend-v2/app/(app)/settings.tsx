/**
 * Settings - Focused account/preferences screen reachable from the header kebab
 * menu. Intended for users who have no Profile tab (parents, observers) but also
 * works for anyone. Deliberately NOT a profile page: no XP/diploma/profile
 * editing — just Appearance, Notifications, and Account actions.
 */

import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { saveTheme } from '@/src/stores/themeStore';
import { useAuthStore } from '@/src/stores/authStore';
import { useBugReportStore } from '@/src/stores/bugReportStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import api from '@/src/services/api';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
} from '@/src/components/ui';
import { NotificationPreferences } from '@/src/components/profile/NotificationPreferences';

interface DeletionStatus {
  deletion_status: 'none' | 'pending';
  deletion_scheduled_for?: string;
  days_remaining?: number;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500 font-poppins-semibold uppercase tracking-wider">
      {children}
    </UIText>
  );
}

export default function SettingsScreen() {
  const c = useThemeColors();
  const { logout } = useAuthStore();
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [deletionStatus, setDeletionStatus] = useState<DeletionStatus>({ deletion_status: 'none' });
  const [deletionRequesting, setDeletionRequesting] = useState(false);

  const loadDeletionStatus = async () => {
    try {
      const { data } = await api.get('/api/users/deletion-status');
      setDeletionStatus(data);
    } catch {
      // Non-critical: leave default 'none'.
    }
  };

  useEffect(() => { loadDeletionStatus(); }, []);

  const handleRequestDeletion = () => {
    Alert.alert(
      'Delete Account',
      'This will schedule your account for permanent deletion in 30 days. You can cancel within the grace period.\n\nAll your data will be permanently deleted after 30 days. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account', style: 'destructive', onPress: async () => {
            setDeletionRequesting(true);
            try {
              await api.post('/api/users/delete-account', { reason: 'User requested deletion' });
              Alert.alert('Scheduled', 'Account deletion scheduled. You have 30 days to cancel.');
              loadDeletionStatus();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.error || 'Failed to request account deletion');
            } finally {
              setDeletionRequesting(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelDeletion = async () => {
    try {
      await api.post('/api/users/cancel-deletion', {});
      Alert.alert('Cancelled', 'Account deletion has been cancelled.');
      loadDeletionStatus();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to cancel deletion');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-surface-200 dark:border-dark-surface-300 bg-white dark:bg-dark-surface-100">
        <Pressable onPress={() => router.back()} className="mr-2 p-1" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#6D469B" />
        </Pressable>
        <Heading size="md">Settings</Heading>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 20 }} showsVerticalScrollIndicator={false}>
        {/* Appearance */}
        <VStack space="sm">
          <SectionLabel>Appearance</SectionLabel>
          <Card variant="elevated" size="md">
            <HStack className="items-center justify-between">
              <HStack className="items-center gap-3">
                <View className="w-9 h-9 rounded-lg bg-dark-surface/10 dark:bg-dark-surface-200 items-center justify-center">
                  <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={isDark ? '#A78BFA' : '#F59E0B'} />
                </View>
                <VStack>
                  <UIText size="sm" className="font-poppins-medium">Dark Mode</UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{isDark ? 'On' : 'Off'}</UIText>
                </VStack>
              </HStack>
              <Switch
                value={isDark}
                onValueChange={(val) => {
                  const mode = val ? 'dark' : 'light';
                  setColorScheme(mode);
                  saveTheme(mode);
                }}
                trackColor={{ false: c.border, true: '#6D469B' }}
                thumbColor="#FFFFFF"
              />
            </HStack>
          </Card>
        </VStack>

        {/* Notifications */}
        <VStack space="sm">
          <SectionLabel>Notifications</SectionLabel>
          <NotificationPreferences />
        </VStack>

        {/* Account */}
        <VStack space="sm">
          <SectionLabel>Account</SectionLabel>
          <Card variant="elevated" size="md">
            {deletionStatus.deletion_status === 'pending' ? (
              <VStack space="sm">
                <HStack className="items-center gap-2">
                  <Ionicons name="warning" size={20} color="#EF4444" />
                  <UIText size="sm" className="font-poppins-semibold text-red-600">Account Deletion Scheduled</UIText>
                </HStack>
                <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                  Your account is scheduled for permanent deletion
                  {deletionStatus.days_remaining !== undefined && ` in ${deletionStatus.days_remaining} days`}.
                  All data will be permanently removed after this period.
                </UIText>
                {deletionStatus.deletion_scheduled_for && (
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                    Scheduled for: {new Date(deletionStatus.deletion_scheduled_for).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </UIText>
                )}
                <Button size="md" variant="outline" onPress={handleCancelDeletion}>
                  <ButtonText>Cancel Deletion</ButtonText>
                </Button>
              </VStack>
            ) : (
              <VStack space="sm">
                <UIText size="sm" className="font-poppins-medium">Delete Account</UIText>
                <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
                  Permanently delete your account and all associated data. A 30-day grace period applies.
                </UIText>
                <Button size="md" variant="outline" action="negative" onPress={handleRequestDeletion} loading={deletionRequesting} disabled={deletionRequesting}>
                  <ButtonText>Delete My Account</ButtonText>
                </Button>
              </VStack>
            )}
          </Card>
        </VStack>

        {/* Report a bug — backstop entry point for the shake gesture */}
        <Pressable onPress={() => useBugReportStore.getState().open()}>
          <Card variant="elevated" size="md">
            <HStack className="items-center gap-3">
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#6D469B15', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="bug-outline" size={22} color="#6D469B" />
              </View>
              <VStack className="flex-1">
                <UIText size="sm" className="font-poppins-medium">Report a bug</UIText>
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Tell us what went wrong</UIText>
              </VStack>
              <Ionicons name="chevron-forward" size={18} color={c.iconMuted} />
            </HStack>
          </Card>
        </Pressable>

        {/* Sign out */}
        <Pressable onPress={() => logout()}>
          <Card variant="elevated" size="md">
            <HStack className="items-center gap-3">
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#EF444415', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="log-out-outline" size={22} color="#EF4444" />
              </View>
              <UIText size="sm" className="font-poppins-medium text-red-600">Sign Out</UIText>
            </HStack>
          </Card>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
