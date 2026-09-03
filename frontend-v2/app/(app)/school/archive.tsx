/**
 * Message archive — the searchable history of what the school has SENT (email
 * and notification fan-outs), newest first with infinite scroll.
 *
 * Titled "Messages", NOT "Announcements": staff post announcements on the
 * community board; this is the sent-message archive. Titling it the other way
 * had a parent reporting the web page broken because her board posts "didn't
 * appear on the announcements tab" (iCreate, 2026-08-06).
 */

import React, { useRef, useState } from 'react';
import { View, Pressable, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Heading, HStack, Input, InputField, InputIcon, InputSlot, UIText, VStack,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useAuthStore } from '@/src/stores/authStore';
import { useSchool, useSchoolArchive, type ArchivedMessage } from '@/src/hooks/useSchool';
import { htmlToText } from '@/src/utils/richText';
import RichBody from '@/src/components/school/RichBody';
import { fmtDate } from '@/src/components/school/format';

function MessageCard({ item }: { item: ArchivedMessage }) {
  const c = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const body = item.content || item.message || '';
  // Length is judged on the words, not the markup, so a formatted message
  // doesn't collapse itself for two lines of tags.
  const plain = htmlToText(body);
  const isLong = plain.length > 280;

  return (
    <View className="bg-white dark:bg-dark-surface-100 border border-surface-200 dark:border-dark-surface-300 rounded-xl p-4 mb-3">
      <HStack className="items-start justify-between gap-3">
        <UIText size="sm" className="font-poppins-semibold flex-1">{item.title}</UIText>
        <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300 mt-0.5">
          {fmtDate(item.created_at)}
        </UIText>
      </HStack>
      <View className="mt-2">
        {!expanded && isLong ? (
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={4}>
            {plain}
          </UIText>
        ) : (
          <RichBody text={body} />
        )}
      </View>
      {isLong && (
        <Pressable onPress={() => setExpanded((e) => !e)} hitSlop={8} className="mt-2">
          <HStack className="items-center gap-1">
            <UIText size="sm" className="text-optio-purple font-poppins-medium">
              {expanded ? 'Show less' : 'Read more'}
            </UIText>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={c.brand} />
          </HStack>
        </Pressable>
      )}
    </View>
  );
}

export default function SchoolArchiveScreen() {
  const c = useThemeColors();
  const school = useSchool();
  // Superadmin preview: the hub passes the previewed org along (?org=) because
  // the archive endpoint resolves the org from membership, which a superadmin
  // lacks. Members never send the param — the backend treats it as
  // superadmin-only.
  const { org: orgParam } = useLocalSearchParams<{ org?: string }>();
  const isSuperadmin = useAuthStore((s) => s.user?.role === 'superadmin');
  const {
    announcements, hasMore, loading, loadingMore, error, query, setQuery, loadMore, refresh, orgName,
  } = useSchoolArchive(
    isSuperadmin && typeof orgParam === 'string' ? { organizationId: orgParam } : undefined,
  );
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const name = school?.name || orgName;

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(value.trim()), 300);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface" edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8, gap: 8 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }} testID="archive-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </Pressable>
        <Heading size="xl" style={{ flex: 1 }} numberOfLines={1}>
          {name ? `Messages from ${name}` : 'Messages'}
        </Heading>
      </View>

      <View className="px-5 pb-2 max-w-3xl w-full md:mx-auto">
        <Input variant="rounded">
          <InputSlot className="ml-3">
            <InputIcon as="search-outline" />
          </InputSlot>
          <InputField
            placeholder="Search messages…"
            value={search}
            onChangeText={onSearchChange}
            autoCapitalize="none"
            testID="archive-search"
          />
        </Input>
      </View>

      {loading && announcements.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      ) : (
        <FlatList
          data={announcements}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageCard item={item} />}
          contentContainerClassName="px-5 pt-2 pb-12 max-w-3xl w-full md:mx-auto"
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />
          }
          ListEmptyComponent={
            <VStack className="items-center pt-16 gap-3">
              {error ? (
                <>
                  <Ionicons name="warning-outline" size={40} color="#E65C5C" />
                  <UIText size="sm" className="text-error-600 text-center">{error}</UIText>
                  <Pressable onPress={refresh} hitSlop={8}>
                    <UIText size="sm" className="text-optio-purple font-poppins-semibold">Retry</UIText>
                  </Pressable>
                </>
              ) : (
                <>
                  <Ionicons name="mail-open-outline" size={40} color={c.iconMuted} />
                  <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 text-center">
                    {query
                      ? 'No messages match your search.'
                      : `When ${name || 'the office'} sends you a message, it will appear here.`}
                  </UIText>
                </>
              )}
            </VStack>
          }
          ListFooterComponent={
            loadingMore ? (
              <View className="py-4 items-center">
                <ActivityIndicator color={c.brand} />
              </View>
            ) : hasMore ? (
              <View className="h-4" />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
