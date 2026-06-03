/**
 * NotificationPreferences - per-type notification toggles.
 *
 * Renders a list of notification types with switches. Absent rows = enabled.
 * Persists via PUT /api/notifications/preferences.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Switch, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Card } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import api from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { usePreviewRoleStore } from '@/src/stores/previewRoleStore';

/** Roles that can actually receive a given notification type. */
type NotificationRole = 'student' | 'parent' | 'observer' | 'advisor';

export interface PreferenceRow {
  type: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Roles for whom this notification can ever fire. */
  roles: NotificationRole[];
}

/**
 * User-facing notification types, ordered by product importance.
 *
 * `roles` mirrors the backend's actual recipient for each type so a viewer only
 * sees toggles for notifications they can receive (e.g. students never post
 * bounties, so "Bounty claims/submissions" are poster-only; observers never
 * own a portfolio, so student/parent approval rows are hidden from them).
 */
const ROWS: PreferenceRow[] = [
  { type: 'message_received', label: 'Messages', description: 'New direct messages.', icon: 'chatbubbles-outline', roles: ['student', 'parent', 'observer', 'advisor'] },
  { type: 'observer_comment', label: 'Comments', description: 'When someone comments on student work.', icon: 'chatbox-outline', roles: ['student', 'parent'] },
  { type: 'bounty_posted', label: 'New bounties', description: 'When a bounty is posted for you.', icon: 'flag-outline', roles: ['student'] },
  { type: 'bounty_claimed', label: 'Bounty claims', description: 'When a student claims your bounty.', icon: 'checkmark-circle-outline', roles: ['parent', 'observer', 'advisor'] },
  { type: 'bounty_submission', label: 'Bounty submissions', description: 'When a student submits a bounty for review.', icon: 'cloud-upload-outline', roles: ['parent', 'observer', 'advisor'] },
  { type: 'task_approved', label: 'Approvals', description: 'When your work or bounty is approved.', icon: 'ribbon-outline', roles: ['student'] },
  { type: 'task_revision_requested', label: 'Revision requests', description: 'When revisions are requested on your work.', icon: 'create-outline', roles: ['student'] },
  { type: 'observer_added', label: 'New observers', description: 'When someone is added as an observer.', icon: 'people-outline', roles: ['student'] },
  { type: 'parent_approval_required', label: 'Approval requests', description: 'Your child requests portfolio approval.', icon: 'shield-checkmark-outline', roles: ['parent'] },
  { type: 'announcement', label: 'Announcements', description: 'Program or school announcements.', icon: 'megaphone-outline', roles: ['student', 'parent', 'observer', 'advisor'] },
];

/**
 * Resolve the viewer's effective role the same way the rest of the app does:
 * superadmin preview wins (for role-shell testing), then org_role for
 * org-managed users, then the platform role.
 */
function useEffectiveRole(): NotificationRole | null {
  const user = useAuthStore((s) => s.user);
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  return useMemo(() => {
    if (user?.role === 'superadmin' && previewRole) return previewRole as NotificationRole;
    if (!user) return null;
    const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
    if (role === 'student' || role === 'parent' || role === 'observer' || role === 'advisor') {
      return role;
    }
    // superadmin / org_admin / unknown -> no filtering (see them all)
    return null;
  }, [user, previewRole]);
}

export function NotificationPreferences() {
  const c = useThemeColors();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const role = useEffectiveRole();

  // Only show toggles for notifications this role can actually receive.
  const rows = useMemo(
    () => (role ? ROWS.filter((r) => r.roles.includes(role)) : ROWS),
    [role],
  );

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
        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
          Turn off notifications you don't want. Changes apply to both in-app and push.
        </UIText>
        {rows.map((row, idx) => {
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
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{row.description}</UIText>
                  </VStack>
                </HStack>
                <Switch
                  value={enabled}
                  onValueChange={() => toggle(row.type, enabled)}
                  disabled={saving === row.type}
                  trackColor={{ false: c.border, true: '#6D469B' }}
                  thumbColor="#FFFFFF"
                />
              </HStack>
              {idx < rows.length - 1 && <View className="h-px bg-surface-100 dark:bg-dark-surface-200 mt-2" />}
            </View>
          );
        })}
      </VStack>
    </Card>
  );
}
