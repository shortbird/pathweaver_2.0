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
  // The office's notices (M1): a seat offered, an enrollment confirmed, a
  // payment due, a document to sign. Sent as 'announcement' until 2026-09-17,
  // so muting one muted the other.
  { type: 'school_notice', label: 'School notices', description: "Enrollment, waitlist, billing and paperwork notices from your school's office.", icon: 'business-outline', roles: ['student', 'parent', 'observer', 'advisor'] },
  // The school day, for a parent (2026-09-15): the three things a teacher
  // does to a child's work that a family used to hear about last.
  { type: 'class_quest_assigned', label: 'New class quests', description: 'When a class quest is assigned to your child.', icon: 'school-outline', roles: ['parent'] },
  { type: 'child_task_reviewed', label: 'Work reviewed', description: "When a teacher reviews your child's work.", icon: 'checkmark-done-outline', roles: ['parent'] },
  { type: 'class_work_reminder', label: 'Unfinished work', description: "A teacher's reminder about work still to do.", icon: 'alarm-outline', roles: ['student', 'parent'] },
  // Friends (2026-09-16). Requests and answers reach the student; a parent
  // hears when a request needs them and when a friend was added.
  { type: 'peer_connection_request', label: 'Friend requests', description: 'When another student wants to be friends.', icon: 'person-add-outline', roles: ['student', 'parent'] },
  { type: 'peer_connection_approved', label: 'New friends', description: 'When a friend request goes through.', icon: 'people-outline', roles: ['student'] },
  { type: 'peer_connection_needs_approval', label: 'Friend approvals', description: 'When a friend request needs your answer.', icon: 'shield-checkmark-outline', roles: ['parent'] },
  { type: 'peer_friend_added', label: 'Friends added', description: 'When your child adds a friend.', icon: 'people-outline', roles: ['parent'] },
  { type: 'peer_comment', label: 'Friend comments', description: 'When a friend comments on your work.', icon: 'chatbox-ellipses-outline', roles: ['student'] },
  { type: 'peer_reaction', label: 'Friend reactions', description: 'When a friend reacts to your work.', icon: 'sparkles-outline', roles: ['student'] },
  { type: 'peer_text_held', label: 'Held messages', description: 'When our safety check holds something your child wrote to a friend.', icon: 'hand-left-outline', roles: ['parent'] },
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
          <ActivityIndicator size="small" color={c.brand} />
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
                    <Ionicons name={row.icon} size={18} color={c.brand} />
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
                  trackColor={{ false: c.border, true: c.brand }}
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
