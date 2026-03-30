/**
 * ScrollPageLayout - Standard scrollable page wrapper.
 *
 * Provides: safe area insets, scroll view, optional title, loading state.
 * Used for most pages (dashboard, quests, journal, etc.).
 */

import React from 'react';
import { ScrollView, ActivityIndicator, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Heading } from '../ui/heading';
import { UIText } from '../ui/text';

interface ScrollPageLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  className?: string;
  contentClassName?: string;
}

export function ScrollPageLayout({
  children,
  title,
  subtitle,
  loading = false,
  refreshing = false,
  onRefresh,
  className = '',
  contentClassName = '',
}: ScrollPageLayoutProps) {
  if (loading) {
    return (
      <SafeAreaView className={`flex-1 bg-surface-50 dark:bg-dark-surface ${className}`}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6D469B" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className={`flex-1 bg-surface-50 dark:bg-dark-surface ${className}`}>
      <ScrollView
        className="flex-1"
        contentContainerClassName={`px-5 pt-6 pb-12 ${contentClassName}`}
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6D469B"
            />
          ) : undefined
        }
      >
        {title && (
          <View className="mb-4">
            <Heading size="2xl">{title}</Heading>
            {subtitle && (
              <UIText size="sm" className="text-typo-500 mt-1">
                {subtitle}
              </UIText>
            )}
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
