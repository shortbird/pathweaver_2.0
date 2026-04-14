/**
 * Notifications Page - List of all user notifications with filters and actions.
 */

import React, { useState, useCallback } from 'react';
import { View, ScrollView, Pressable, RefreshControl, Platform, useWindowDimensions, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { useNotifications } from '@/src/hooks/useNotifications';
import api from '@/src/services/api';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText, Divider,
} from '@/src/components/ui';

const DESKTOP_BREAKPOINT = 768;

// ── Notification type icons ──

const TYPE_ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  quest_invitation: { name: 'compass-outline', color: '#6D469B' },
  announcement: { name: 'megaphone-outline', color: '#2469D1' },
  task_approved: { name: 'checkmark-circle-outline', color: '#16A34A' },
  task_revision_requested: { name: 'alert-circle-outline', color: '#E65C5C' },
  observer_comment: { name: 'chatbubble-outline', color: '#3DA24A' },
  observer_added: { name: 'person-add-outline', color: '#6D469B' },
  parent_approval_required: { name: 'shield-checkmark-outline', color: '#FF9028' },
  message_received: { name: 'mail-outline', color: '#2469D1' },
  bounty_posted: { name: 'flag-outline', color: '#E85D8A' },
  bounty_claimed: { name: 'checkmark-circle-outline', color: '#16A34A' },
  bounty_submission: { name: 'cloud-upload-outline', color: '#6D469B' },
};

function getIcon(type: string) {
  return TYPE_ICONS[type] || { name: 'notifications-outline' as const, color: '#6B7280' };
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Notification Card ──

function NotificationCard({
  notification,
  onPress,
  onDelete,
}: {
  notification: any;
  onPress: () => void;
  onDelete: () => void;
}) {
  const icon = getIcon(notification.type);
  const isAnnouncement = notification.type === 'announcement';
  const fullContent = notification.metadata?.full_content;
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable onPress={onPress}>
      <Card
        variant={notification.is_read ? 'filled' : 'elevated'}
        size="sm"
        className={`${notification.is_read ? 'bg-surface-50' : 'bg-white border-l-4 border-l-optio-purple'}`}
      >
        <HStack className="items-start gap-3">
          {/* Icon */}
          <View style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: `${icon.color}15`,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name={icon.name} size={18} color={icon.color} />
          </View>

          {/* Content */}
          <VStack className="flex-1 min-w-0">
            <HStack className="items-center justify-between">
              <UIText
                size="sm"
                className={`font-poppins-semibold flex-1 ${notification.is_read ? 'text-typo-400' : 'text-typo-900'}`}
                numberOfLines={1}
              >
                {notification.title}
              </UIText>
              <UIText size="xs" className="text-typo-300 ml-2 flex-shrink-0">
                {timeAgo(notification.created_at)}
              </UIText>
            </HStack>

            {notification.message && (
              <UIText
                size="xs"
                className={notification.is_read ? 'text-typo-300' : 'text-typo-500'}
                numberOfLines={expanded ? undefined : 2}
              >
                {notification.message}
              </UIText>
            )}

            {/* Expandable announcement content */}
            {isAnnouncement && fullContent && (
              <Pressable onPress={(e) => { e.stopPropagation?.(); setExpanded(!expanded); }}>
                <UIText size="xs" className="text-optio-purple font-poppins-medium mt-1">
                  {expanded ? 'Show less' : 'Read more'}
                </UIText>
              </Pressable>
            )}
            {isAnnouncement && fullContent && expanded && (
              <UIText size="xs" className="text-typo-500 mt-2">
                {fullContent}
              </UIText>
            )}
          </VStack>

          {/* Delete button */}
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); onDelete(); }}
            style={{ padding: 4 }}
          >
            <Ionicons name="close" size={16} color="#D1D5DB" />
          </Pressable>
        </HStack>
      </Card>
    </Pressable>
  );
}

// ── Main Page ──

export default function NotificationsScreen() {
  const { user } = useAuthStore();
  const {
    notifications,
    unreadCount,
    loading,
    refetch,
    markRead,
    markAllAsRead,
    remove,
  } = useNotifications(user?.id);

  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastAudience, setBroadcastAudience] = useState<string>('all');
  const [broadcasting, setBroadcasting] = useState(false);

  const effectiveRole = user?.role === 'org_managed' && user?.org_role ? user.org_role : user?.role;
  const canBroadcast = ['advisor', 'org_admin', 'superadmin'].includes(effectiveRole || '');

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch(filter === 'unread');
    setRefreshing(false);
  }, [refetch, filter]);

  const handlePress = useCallback(async (notification: any) => {
    if (!notification.is_read) {
      await markRead(notification.id);
    }
    // Navigate to link if present
    if (notification.link) {
      const link = notification.link.startsWith('/') ? `/(app)${notification.link}` : notification.link;
      try {
        router.push(link as any);
      } catch {
        // Invalid route, just stay on page
      }
    }
  }, [markRead]);

  const handleBroadcast = useCallback(async () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      Alert.alert('Error', 'Title and message are required');
      return;
    }
    setBroadcasting(true);
    try {
      const { data } = await api.post('/api/notifications/broadcast', {
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim(),
        target_audience: [broadcastAudience],
      });
      Alert.alert('Sent', `Notification sent to ${data.notifications_sent} users`);
      setBroadcastTitle('');
      setBroadcastMessage('');
      setShowBroadcast(false);
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to send notification');
    } finally {
      setBroadcasting(false);
    }
  }, [broadcastTitle, broadcastMessage, broadcastAudience, refetch]);

  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  return (
    <SafeAreaView className="flex-1 bg-surface-50" edges={['top']}>
      {/* Mobile header with back button */}
      {!isDesktop && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8, gap: 8 }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
            <Ionicons name="chevron-back" size={24} color="#374151" />
          </Pressable>
          <Heading size="xl" style={{ flex: 1 }}>Notifications</Heading>
          {unreadCount > 0 && (
            <Pressable onPress={markAllAsRead} style={{ padding: 4 }}>
              <UIText size="xs" className="text-optio-purple font-poppins-medium">Mark all read</UIText>
            </Pressable>
          )}
        </View>
      )}

      {/* Desktop header */}
      {isDesktop && (
        <View className="px-5 md:px-8 pt-6 pb-2 max-w-3xl w-full md:mx-auto">
          <HStack className="items-center justify-between">
            <HStack className="items-center gap-3">
              <Pressable onPress={() => router.back()} className="p-1 -ml-1 rounded-lg active:bg-surface-100">
                <Ionicons name="arrow-back" size={20} color="#6B7280" />
              </Pressable>
              <VStack>
                <Heading size="2xl">Notifications</Heading>
                <UIText size="sm" className="text-typo-400">
                  {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
                </UIText>
              </VStack>
            </HStack>
            <HStack className="gap-2">
              {canBroadcast && (
                <Button size="sm" onPress={() => setShowBroadcast(true)} className="bg-optio-purple">
                  <ButtonText>Send Notification</ButtonText>
                </Button>
              )}
              {unreadCount > 0 && (
                <Button size="sm" variant="outline" onPress={markAllAsRead}>
                  <ButtonText>Mark all read</ButtonText>
                </Button>
              )}
            </HStack>
          </HStack>
        </View>
      )}

      {/* Filter tabs */}
      <View className="px-5 md:px-8 pt-3 pb-1 max-w-3xl w-full md:mx-auto">
        <HStack className="gap-2">
          {(['all', 'unread'] as const).map(f => (
            <Pressable
              key={f}
              onPress={() => { setFilter(f); refetch(f === 'unread'); }}
              className={`px-4 py-1.5 rounded-full ${
                filter === f ? 'bg-optio-purple' : 'bg-surface-100'
              }`}
            >
              <UIText
                size="xs"
                className={`font-poppins-medium capitalize ${
                  filter === f ? 'text-white' : 'text-typo-500'
                }`}
              >
                {f === 'unread' ? `Unread (${unreadCount})` : 'All'}
              </UIText>
            </Pressable>
          ))}

          <View className="flex-1" />
        </HStack>
      </View>

      {/* Notification list */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 md:px-8 pt-3 pb-12 max-w-3xl w-full md:mx-auto"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6D469B" />
        }
      >
        {loading && filtered.length === 0 ? (
          <VStack space="sm" className="pt-4">
            {[1, 2, 3, 4].map(i => (
              <View key={i} className="h-20 bg-surface-100 rounded-xl animate-pulse" />
            ))}
          </VStack>
        ) : filtered.length > 0 ? (
          <VStack space="sm">
            {filtered.map(notification => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onPress={() => handlePress(notification)}
                onDelete={() => remove(notification.id)}
              />
            ))}
          </VStack>
        ) : (
          <VStack className="items-center justify-center pt-20 gap-3">
            <Ionicons name="notifications-off-outline" size={48} color="#D1D5DB" />
            <Heading size="sm" className="text-typo-400">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </Heading>
            <UIText size="sm" className="text-typo-300 text-center">
              {filter === 'unread'
                ? 'You\'re all caught up!'
                : 'Notifications about tasks, quests, and messages will appear here.'}
            </UIText>
          </VStack>
        )}
      </ScrollView>

      {/* Broadcast Modal */}
      <Modal visible={showBroadcast} transparent animationType="fade" onRequestClose={() => setShowBroadcast(false)}>
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setShowBroadcast(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{ backgroundColor: '#FFF', borderRadius: 20, width: 480, maxWidth: '92%', padding: 24 }}
          >
            <VStack space="md">
              <HStack className="items-center justify-between">
                <Heading size="lg">Send Notification</Heading>
                <Pressable onPress={() => setShowBroadcast(false)}>
                  <Ionicons name="close" size={24} color="#6B7280" />
                </Pressable>
              </HStack>

              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Title</UIText>
                <TextInput
                  className="border border-surface-300 rounded-xl px-4 py-3 text-sm bg-white"
                  placeholder="Notification title"
                  value={broadcastTitle}
                  onChangeText={setBroadcastTitle}
                  style={{ fontFamily: 'Poppins_400Regular' }}
                />
              </VStack>

              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Message</UIText>
                <TextInput
                  className="border border-surface-300 rounded-xl px-4 py-3 text-sm bg-white"
                  placeholder="Write your message..."
                  value={broadcastMessage}
                  onChangeText={setBroadcastMessage}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  style={{ fontFamily: 'Poppins_400Regular', minHeight: 100 }}
                />
              </VStack>

              <VStack space="xs">
                <UIText size="sm" className="font-poppins-medium">Audience</UIText>
                <HStack className="gap-2 flex-wrap">
                  {[
                    { value: 'all', label: 'Everyone' },
                    { value: 'students', label: 'Students' },
                    { value: 'parents', label: 'Parents' },
                    { value: 'advisors', label: 'Advisors' },
                  ].map(opt => (
                    <Pressable
                      key={opt.value}
                      onPress={() => setBroadcastAudience(opt.value)}
                      className={`px-4 py-2 rounded-full ${broadcastAudience === opt.value ? 'bg-optio-purple' : 'bg-surface-100'}`}
                    >
                      <UIText size="xs" className={`font-poppins-medium ${broadcastAudience === opt.value ? 'text-white' : 'text-typo-500'}`}>
                        {opt.label}
                      </UIText>
                    </Pressable>
                  ))}
                </HStack>
              </VStack>

              <Button size="lg" onPress={handleBroadcast} isDisabled={broadcasting} className="bg-optio-purple">
                <ButtonText>{broadcasting ? 'Sending...' : 'Send Notification'}</ButtonText>
              </Button>
            </VStack>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
