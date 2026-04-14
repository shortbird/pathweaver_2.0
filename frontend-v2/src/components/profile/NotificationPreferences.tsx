/**
 * NotificationPreferences - per-type notification toggles.
 *
 * Renders a list of notification types with switches. Absent rows = enabled.
 * Persists via PUT /api/notifications/preferences.
 */

import React, { useEffect, useState } from 'react';
import { View, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Card } from '@/src/components/ui';
import api from '@/src/services/api';

export interface PreferenceRow {
  type: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/** User-facing notification types, ordered by product importance. */
const ROWS: PreferenceRow[] = [
  { type: 'message_received', label: 'Messages', description: 'New direct messages.', icon: 'chatbubbles-outline' },
  { type: 'observer_comment', label: 'Comments', description: 'When someone comments on your work.', icon: 'chatbox-outline' },
  { type: 'bounty_posted', label: 'New bounties', description: 'When an observer posts a bounty for you.', icon: 'flag-outline' },
  { type: 'bounty_claimed', label: 'Bounty claims', description: 'When a student claims your bounty.', icon: 'checkmark-circle-outline' },
  { type: 'bounty_submission', label: 'Bounty submissions', description: 'When a student submits a bounty for review.', icon: 'cloud-upload-outline' },
  { type: 'task_approved', label: 'Approvals', description: 'When your work or bounty is approved.', icon: 'ribbon-outline' },
  { type: 'task_revision_requested', label: 'Revision requests', description: 'When your advisor requests revisions.', icon: 'create-outline' },
  { type: 'observer_added', label: 'New observers', description: 'When someone is added as an observer.', icon: 'people-outline' },
  { type: 'parent_approval_required', label: 'Approval requests', description: 'Your child requests portfolio approval.', icon: 'shield-checkmark-outline' },
  { type: 'announcement', label: 'Announcements', description: 'Program or school announcements.', icon: 'megaphone-outline' },
];

export function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/api/notifications/preferences');
        if (!cancelled) setPrefs(data?.preferences || {});
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (type: string, currentEnabled: boolean) => {
    const next = !currentEnabled;
    setPrefs((p) => ({ ...p, [type]: next }));
    setSaving(type);
    try {
      await api.put('/api/notifications/preferences', {
        preferences: { [type]: next },
      });
    } catch {
      // revert on failure
      setPrefs((p) => ({ ...p, [type]: currentEnabled }));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <Card variant="elevated" size="md">
        <View className="py-8 items-center">
          <ActivityIndicator size="small" color="#6D469B" />
        </View>
      </Card>
    );
  }

  return (
    <Card variant="elevated" size="md">
      <VStack space="md">
        <UIText size="xs" className="text-typo-400">
          Turn off notifications you don't want. Changes apply to both in-app and push.
        </UIText>
        {ROWS.map((row, idx) => {
          // Absent in prefs = enabled by default
          const enabled = prefs[row.type] !== false;
          return (
            <View key={row.type}>
              <HStack className="items-center justify-between py-1">
                <HStack className="items-center gap-3 flex-1">
                  <View className="w-9 h-9 rounded-lg bg-optio-purple/10 items-center justify-center">
                    <Ionicons name={row.icon} size={18} color="#6D469B" />
                  </View>
                  <VStack className="flex-1">
                    <UIText size="sm" className="font-poppins-medium">{row.label}</UIText>
                    <UIText size="xs" className="text-typo-400">{row.description}</UIText>
                  </VStack>
                </HStack>
                <Switch
                  value={enabled}
                  onValueChange={() => toggle(row.type, enabled)}
                  disabled={saving === row.type}
                  trackColor={{ false: '#E5E7EB', true: '#6D469B' }}
                  thumbColor="#FFFFFF"
                />
              </HStack>
              {idx < ROWS.length - 1 && <View className="h-px bg-surface-100 mt-2" />}
            </View>
          );
        })}
      </VStack>
    </Card>
  );
}
